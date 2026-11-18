import { useEffect, useState } from "react";
import type {
  AgentHostToWebviewMessage,
  AgentUiSnapshot,
} from "@latex-comfort/shared";
import { AgentView } from "./AgentView";
import { vscode } from "./vscode";
import "./agent.css";

const INITIAL: AgentUiSnapshot = {
  revision: 0,
  threadId: "new-thread",
  agentId: "opencode",
  agentLabel: "OpenCode",
  phase: "starting",
  title: "New thread",
  entries: [],
  configOptions: [],
  authMethods: [],
  threads: [],
  turns: [],
};

export function AgentApp() {
  const [snapshot, setSnapshot] = useState<AgentUiSnapshot>(INITIAL);

  useEffect(() => {
    const onMessage = (event: MessageEvent<AgentHostToWebviewMessage>) => {
      if (event.data.type === "agentSnapshot") setSnapshot(event.data.snapshot);
    };
    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "agentWebviewReady" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <AgentView
      snapshot={snapshot}
      onSend={(text) => vscode.postMessage({ type: "agentSend", text })}
      onCancel={() => vscode.postMessage({ type: "agentCancel" })}
      onNewThread={() => vscode.postMessage({ type: "agentNewThread" })}
      onOpenThread={(threadId) =>
        vscode.postMessage({ type: "agentOpenThread", threadId })
      }
      onDeleteThread={(threadId) =>
        vscode.postMessage({ type: "agentDeleteThread", threadId })
      }
      onSelectAgent={(agentId) =>
        vscode.postMessage({ type: "agentSelectAgent", agentId })
      }
      onSelectConfig={(configId, value) =>
        vscode.postMessage({ type: "agentSelectConfig", configId, value })
      }
      onSetVisibleModels={(values) =>
        vscode.postMessage({ type: "agentSetVisibleModels", values })
      }
      onResolvePermission={(permissionId, optionId) =>
        vscode.postMessage({
          type: "agentResolvePermission",
          permissionId,
          ...(optionId ? { optionId } : {}),
        })
      }
      onAuthenticate={(methodId) =>
        vscode.postMessage({
          type: "agentAuthenticate",
          ...(methodId ? { methodId } : {}),
        })
      }
      onOpenDiff={(turnId, path) =>
        vscode.postMessage({ type: "agentOpenDiff", turnId, path })
      }
      onOpenTurnDiffs={(turnId) =>
        vscode.postMessage({ type: "agentOpenTurnDiffs", turnId })
      }
      onRestoreTurn={(turnId) =>
        vscode.postMessage({ type: "agentRestoreTurn", turnId })
      }
      onOpenLocation={(path, line) =>
        vscode.postMessage({
          type: "agentOpenLocation",
          path,
          ...(line ? { line } : {}),
        })
      }
      onOpenSettings={() => vscode.postMessage({ type: "agentOpenSettings" })}
    />
  );
}
