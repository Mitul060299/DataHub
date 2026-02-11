from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
from ..security import get_current_role, require_role

router = APIRouter(prefix="/realtime", tags=["realtime"])


class PresenceManager:
    def __init__(self) -> None:
        self._connections: Dict[str, Set[WebSocket]] = {}
        self._users: Dict[str, Set[str]] = {}
        self._messages: Dict[str, list[dict]] = {}

    async def connect(self, workspace_id: str, user: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(workspace_id, set()).add(websocket)
        self._users.setdefault(workspace_id, set()).add(user)
        await self.broadcast_presence(workspace_id)
        await self.send_history(workspace_id, websocket)

    async def disconnect(self, workspace_id: str, user: str, websocket: WebSocket) -> None:
        if workspace_id in self._connections:
            self._connections[workspace_id].discard(websocket)
        if workspace_id in self._users:
            self._users[workspace_id].discard(user)
        await self.broadcast_presence(workspace_id)

    async def broadcast_presence(self, workspace_id: str) -> None:
        users = sorted(list(self._users.get(workspace_id, set())))
        payload = json.dumps({"type": "presence", "workspace_id": workspace_id, "users": users})
        for ws in list(self._connections.get(workspace_id, set())):
            try:
                await ws.send_text(payload)
            except Exception:
                try:
                    await ws.close()
                except Exception:
                    pass

    async def broadcast_message(self, workspace_id: str, message: dict) -> None:
        self._messages.setdefault(workspace_id, []).append(message)
        self._messages[workspace_id] = self._messages[workspace_id][-50:]
        payload = json.dumps({"type": "message", "workspace_id": workspace_id, "message": message})
        for ws in list(self._connections.get(workspace_id, set())):
            try:
                await ws.send_text(payload)
            except Exception:
                try:
                    await ws.close()
                except Exception:
                    pass

    async def send_history(self, workspace_id: str, websocket: WebSocket) -> None:
        history = self._messages.get(workspace_id, [])
        payload = json.dumps({"type": "history", "workspace_id": workspace_id, "messages": history})
        try:
            await websocket.send_text(payload)
        except Exception:
            pass


presence_manager = PresenceManager()


@router.websocket("/presence")
async def presence(websocket: WebSocket, workspace_id: str = "default", user: str = "anon"):
    authorization = websocket.headers.get("authorization")
    role = get_current_role(authorization)
    try:
        require_role("viewer", role)
    except Exception:
        await websocket.close(code=4403)
        return
    await presence_manager.connect(workspace_id, user, websocket)
    try:
        while True:
            message = await websocket.receive_text()
            try:
                payload = json.loads(message)
                if isinstance(payload, dict) and payload.get("type") == "message":
                    text = str(payload.get("text", "")).strip()
                    if text:
                        await presence_manager.broadcast_message(
                            workspace_id,
                            {"user": user, "text": text},
                        )
            except Exception:
                continue
    except WebSocketDisconnect:
        await presence_manager.disconnect(workspace_id, user, websocket)
    except Exception:
        await presence_manager.disconnect(workspace_id, user, websocket)
