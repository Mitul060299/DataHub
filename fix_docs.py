"""Update docs to reflect project-centric model (no more workspaces)."""
import re
import os

DOCS_DIR = r"c:\Users\mitul\OneDrive\Desktop\DataHub\docs"

def update_doc(content):
    # Replace API headers
    content = content.replace('X-Workspace-Id', 'X-Project-Id')
    content = content.replace('x-workspace-id', 'x-project-id')
    # Replace workspace_id param references
    content = re.sub(r'\bworkspace_id\b', 'project_id', content)
    # Replace "workspace" / "Workspace" / plural forms in user-facing text
    content = re.sub(r'\bWorkspaces\b', 'Projects', content)
    content = re.sub(r'\bWorkspace\b', 'Project', content)
    content = re.sub(r'\bworkspaces\b', 'projects', content)
    content = re.sub(r'\bworkspace\b', 'project', content)
    return content

doc_files = [f for f in os.listdir(DOCS_DIR) if f.endswith('.md') and not os.path.isdir(os.path.join(DOCS_DIR, f))]
for filename in doc_files:
    path = os.path.join(DOCS_DIR, filename)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    updated = update_doc(content)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(updated)
    print(f"Updated: {filename}")

print("Docs updated!")

