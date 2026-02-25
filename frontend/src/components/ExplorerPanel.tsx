import { useEffect, useState } from "react";
import { api } from "../api";
import { usePipeline } from "../hooks/usePipeline";
import { useWorkspaceContext, type Dataset } from "../contexts/WorkspaceContext";
import { IconChevronDown, IconTeam } from "./Icons";
import { DataSection } from "./DataSection";
import { PipelineSection } from "./PipelineSection";
import { MembersModal } from "./modals/MembersModal";
import { ProjectModal } from "./modals/ProjectModal";
import { ImportModal } from "./modals/ImportModal";
import { ScheduleModal } from "./modals/ScheduleModal";
import { usePipelineContext } from "../contexts/PipelineContext";

interface ExplorerPanelProps {
  workspaceId: string;
}

export function ExplorerPanel({ workspaceId }: ExplorerPanelProps) {
  const { activeProject, setActiveProject, activeDataset, setActiveDataset, members } = useWorkspaceContext();
  const { steps, setScheduleInfo } = usePipelineContext();
  const { exportPipeline, schedule } = usePipeline();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  useEffect(() => {
    const loadDatasets = async () => {
      if (!activeProject?.id) {
        setDatasets([]);
        return;
      }
      try {
        const response = await api.get("/datasets", { params: { project_id: activeProject.id } });
        const mapped = (response.data ?? []).map((item: Record<string, unknown>) => ({
          id: String(item.id ?? item.dataset_id ?? ""),
          name: String(item.name ?? item.filename ?? item.table_name ?? "dataset"),
          rows: Number(item.row_count ?? item.rows ?? 0),
        }));
        setDatasets(mapped);
      } catch {
        setDatasets([]);
      }
    };
    void loadDatasets();
  }, [activeProject?.id]);

  return (
    <aside style={{ width: "var(--sw)", minWidth: "var(--sw)", borderRight: "1px solid var(--bd)", background: "var(--bg1)", padding: 10, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="proj-selector" onClick={() => setProjectModalOpen(true)} style={{ border: "1px solid var(--bd2)", background: "var(--bg2)", borderRadius: "var(--r8)", height: 36, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", marginBottom: 10 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: activeProject?.color ?? "var(--ac)", display: "grid", placeItems: "center", fontSize: 11 }}>
            {activeProject?.initial ?? "D"}
          </div>
          <span>{activeProject?.name ?? "Select Project"}</span>
        </div>
        <IconChevronDown size={14} />
      </div>

      <div className="members-strip" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "inline-flex", alignItems: "center" }}>
          {members.map((member, index) => (
            <div key={member.id} title={member.name} style={{ width: 22, height: 22, borderRadius: 999, border: "1px solid var(--bg1)", background: "var(--acg)", display: "grid", placeItems: "center", marginLeft: index ? -5 : 0, fontSize: 11 }}>
              {member.name.slice(0, 1).toUpperCase()}
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => setMembersModalOpen(true)} style={{ height: 24, fontSize: 11 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><IconTeam size={13} />+ Invite</span>
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <DataSection
          datasets={datasets}
          activeDatasetId={activeDataset?.id}
          onSelect={setActiveDataset}
          onImport={() => setImportModalOpen(true)}
        />
        <PipelineSection
          onSchedule={() => setScheduleModalOpen(true)}
          onExport={() => exportPipeline(steps)}
        />
      </div>

      <MembersModal open={membersModalOpen} workspaceId={workspaceId} onClose={() => setMembersModalOpen(false)} />
      <ProjectModal
        open={projectModalOpen}
        workspaceId={workspaceId}
        onClose={() => setProjectModalOpen(false)}
        onSelect={setActiveProject}
      />
      <ImportModal open={importModalOpen} onClose={() => setImportModalOpen(false)} onImported={() => setImportModalOpen(false)} />
      <ScheduleModal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        onConfirm={(payload) => {
          setScheduleInfo(payload);
          void schedule("default", payload.cron);
        }}
      />
    </aside>
  );
}
