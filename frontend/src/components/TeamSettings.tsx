import { OrgMemberSettings } from "./OrgMemberSettings";

/**
 * TeamSettings — Settings → Team tab.
 *
 * Renders the org-account team management UI. Owners see the invite form &
 * member list; non-owner members see a read-only view of who's on the team.
 */
export function TeamSettings() {
  return <OrgMemberSettings />;
}

export default TeamSettings;
