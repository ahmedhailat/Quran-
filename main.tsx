import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { TRPCProvider } from "@/lib/trpc";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error('Missing root element: add <div id="root"></div> to index.html');
createRoot(container).render(<React.StrictMode><TRPCProvider><App /></TRPCProvider></React.StrictMode>);
