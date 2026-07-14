import { createRoot } from "react-dom/client";
import App from "./App";
import { installApiBase } from "./lib/api-base";
import "./index.css";

// Point relative /api calls at the deployed backend when running in the native
// shell (VITE_API_URL set). No-op on the web. Must run before any data fetching.
installApiBase();

createRoot(document.getElementById("root")!).render(<App />);
