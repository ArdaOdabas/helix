# Host Helix on Render

The public web app runs on Render. The desktop app and local development server continue to use loopback on the computer running them.

Deploy this repository as a Render Blueprint using `render.yaml`. It builds Helix with Node 24, starts the editor and document API on the same HTTPS origin, and uses temporary cloud storage for browser workspaces. The default configuration uses the Render-assigned domain. Render generates the session secret. Keep it stable across deployments because rotating it invalidates existing workspace cookies.

Anyone can open the link. The editor creates a private workspace tied to a signed cookie in that browser profile. A different profile or device gets a new workspace. Export important figures as editable JSON before clearing browser data or switching devices. The hosted service starts with the built-in icon library and its own temporary directory. Use the local application for MCP workflows.

Before sharing the URL, check that two private browser profiles receive different document lists and that users can export and re-import editable JSON. Render can erase server-side documents when the service sleeps, restarts, or redeploys.
