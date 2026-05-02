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

    async def connect(self, project_id: str, user: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(project_id, set()).add(websocket)
        self._users.setdefault(project_id, set()).add(user)
        await self.broadcast_presence(project_id)
        await self.send_history(project_id, websocket)

    async def disconnect(self, project_id: str, user: str, websocket: WebSocket) -> None:
        if project_id in self._connections:
            self._connections[project_id].discard(websocket)
        if project_id in self._users:
            self._users[project_id].discard(user)
        await self.broadcast_presence(project_id)

    async def broadcast_presence(self, project_id: str) -> None:
        users = sorted(list(self._users.get(project_id, set())))
        payload = json.dumps({"type": "presence", "project_id": project_id, "users": users})
        for ws in list(self._connections.get(project_id, set())):
            try:
                await ws.send_text(payload)
            except Exception:
                try:
                    await ws.close()
                except Exception:
                    pass

    async def broadcast_message(self, project_id: str, message: dict) -> None:
        self._messages.setdefault(project_id, []).append(message)
        self._messages[project_id] = self._messages[project_id][-50:]
        payload = json.dumps({"type": "message", "project_id": project_id, "message": message})
        for ws in list(self._connections.get(project_id, set())):
            try:
                await ws.send_text(payload)
            except Exception:
                try:
                    await ws.close()
                except Exception:
                    pass

    async def send_history(self, project_id: str, websocket: WebSocket) -> None:
        history = self._messages.get(project_id, [])
        payload = json.dumps({"type": "history", "project_id": project_id, "messages": history})
        try:
            await websocket.send_text(payload)
        except Exception:
            pass


presence_manager = PresenceManager()


@router.websocket("/presence")
async def presence(websocket: WebSocket, project_id: str = "default", user: str = "anon"):
    authorization = websocket.headers.get("authorization")
    token = websocket.query_params.get("token")
    if not authorization and token:
        authorization = f"Bearer {token}"
    role = get_current_role(authorization)
    try:
        require_role("viewer", role)
    except Exception:
        await websocket.close(code=4403)
        return
    await presence_manager.connect(project_id, user, websocket)
    try:
        while True:
            message = await websocket.receive_text()
            try:
                payload = json.loads(message)
                if isinstance(payload, dict) and payload.get("type") == "message":
                    text = str(payload.get("text", "")).strip()
                    if text:
                        await presence_manager.broadcast_message(
                            project_id,
                            {"user": user, "text": text},
                        )
            except Exception:
                continue
    except WebSocketDisconnect:
        await presence_manager.disconnect(project_id, user, websocket)
    except Exception:
        await presence_manager.disconnect(project_id, user, websocket)
