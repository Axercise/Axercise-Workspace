"""Validate Axercise tools with Hermes' installed MCP client; no model calls."""
import asyncio
import json
import sys
from pathlib import Path

import yaml
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[1]


async def main():
    for agent in ("hermes", "secretary", "developer"):
        cfg = yaml.safe_load((ROOT / ".axercise" / "hermes" / agent / "config.yaml").read_text(encoding="utf-8"))
        server = cfg["mcp_servers"]["axercise"]
        params = StdioServerParameters(command=server["command"], args=server["args"], env=server["env"])
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as client:
                await client.initialize()
                tools = await client.list_tools()
                names = {tool.name for tool in tools.tools}
                assert "tasks_create" in names and "calendar_create" in names
                assert {"learning_list", "learning_read", "learning_search", "learning_save", "learning_link"} <= names
                assert {"reminders_list", "reminders_update"} <= names
                task_update = next(tool for tool in tools.tools if tool.name == "tasks_update")
                assert task_update.input_schema["properties"]["calendarEnabled"]["type"] == "boolean"
                learning = await client.call_tool("learning_list", {"kind": "courses"})
                assert not learning.is_error
                reminders = await client.call_tool("reminders_list", {})
                assert not reminders.is_error
                assert ("agent_delegate" in names) == (agent == "hermes")
                print(json.dumps({"agent": agent, "tools": len(names), "mcp_client": "passed"}), flush=True)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception:
        print("MCP client validation failed; inspect the local transport configuration.", file=sys.stderr)
        sys.exit(1)
