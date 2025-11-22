Model Context Protocol (MCP) Overview

MCP is an open protocol for connecting LLM-based assistants to external data sources and tools. It emerged in late 2024 (introduced by Anthropic) to solve the classic “M×N integration” problem: instead of building one-off connectors for every model–tool pairing, MCP provides a single standard JSON‑RPC protocol so any AI host (e.g. Claude Desktop or an IDE) can communicate with any compliant service (MCP server)
humanloop.com
anthropic.com
. In practice, an MCP “client” loads tool definitions, resources, and prompt templates into the model’s context, and then routes LLM-generated tool calls back to the appropriate servers. As one illustration, the Anthropic team explains that an MCP client “loads tool definitions into the model’s context window and orchestrates a message loop” – the LLM sees the available tools and any interim results, and chooses which tool to call next
anthropic.com
. This is akin to attaching an “AI USB port” to your LLM: with MCP you can plug in Google Drive, Slack, Postgres, or home-grown APIs all under one consistent interface
humanloop.com
anthropic.com
.

Fig: High-level MCP architecture. A Host application (top) talks to an MCP Client, which communicates via JSON-RPC with one or more MCP Servers (orange boxes). Each server manages a specific tool or data source (e.g. databases, services). (Source: Cloudflare/Humanloop)

Major AI platforms have rapidly embraced MCP. Within months of launch, developers built “thousands” of MCP servers and SDKs in every language
anthropic.com
. Companies like GitHub, AWS, ClickHouse, Zed, Replit, Sourcegraph and others are building MCP servers or integrating MCP clients into their tools
anthropic.com
anthropic.com
. For example, Anthropic’s Claude Desktop now has local MCP support (letting you run servers as subprocesses or local services) and a repository of pre-built servers (Google Drive, Slack, GitHub, etc.)
anthropic.com
. By standardizing on MCP, developers can “write once” to integrate with this entire ecosystem of servers
anthropic.com
humanloop.com
.

Transport Evolution: SSE to Streamable HTTP

MCP’s base protocol uses JSON-RPC messages, and supports two transport methods. Originally (before mid-2025) MCP used simple stdio or HTTP+Server-Sent Events (SSE) for streaming. In the latest spec (v2025‑06‑18), the protocol deprecates the old HTTP+SSE and defines a new “Streamable HTTP” transport
modelcontextprotocol.io
. In practice, this means an MCP server now runs as an independent HTTP service (e.g. POST /mcp for requests, with optional server-to-client SSE streams for outputs). Clients must still support launching local subprocesses over stdio when needed
modelcontextprotocol.io
, but remote servers communicate over standard HTTP. For example, a client sends JSON-RPC via HTTP POST, and if a response will be streamed it sets the Accept: text/event-stream header. The server can then push back multiple messages (e.g. incremental chunks) over an SSE connection before returning the final response
modelcontextprotocol.io
.

This shift parallels how major tools work. (For instance, OpenAI’s function-calling and ChatGPT plugins use HTTPS/JSON endpoints rather than custom SSE protocols.) Like MCP’s streamable transport, OpenAI’s new Responses API unifies multi-tool calls into a single HTTP call with streaming events
openai.com
. Notably, the MCP spec also stresses security for HTTP mode: servers must validate the Origin header, bind to localhost by default, and require authentication on all endpoints
modelcontextprotocol.io
 to prevent cross-site attacks. This is critical because remote MCP servers now handle multi-user concerns (auth, rate-limits, quotas) in much the same way as a typical REST API.

Tools and Sampling Model

Under MCP, Servers define tools, resources, and prompts that they offer. A host/agent uses an MCP Client to discover these via JSON-RPC calls (e.g. tools/list to enumerate tools, resources/get to fetch data). The client then injects these tool signatures into the LLM prompt. The LLM can invoke a tool by outputting a special call syntax, which the client intercepts and forwards to the server (via tools/call). The server executes the action and returns the result, which the client feeds back into the LLM. In this way an LLM app can multi-step through multiple tools. Notably, MCP also supports nested LLM calls: servers themselves can request LLM sampling via the client (using methods like sampling/createMessage). In other words, a server can treat the model as a tool and ask it to generate text or code. This flips the usual flow (where only the client prompts the model) and enables hierarchical reasoning or delegation.

Anthropic’s engineering blog illustrates this “agent-as-server” loop. In their code-execution example, the MCP client provides a file-system–like interface to the LLM, but when a “tool” is invoked the actual Python code runs outside the model (in a sandbox) to avoid blowing the token budget
anthropic.com
. The diagram below shows this exchange: the client loads the tool schemas, the LLM chooses tools, and each tool call/result “passes through” the model between operations
anthropic.com
. Critically, MCP enforces user-in-the-loop controls at every step. The spec explicitly requires explicit user approval before any tool call or LLM sampling
modelcontextprotocol.io
. Hosts should display each proposed tool invocation (and its prompt text) to the user for consent
modelcontextprotocol.io
. Once approved, the client sends the request to the LLM; after the LLM generates a result, the client again shows it to the user before passing it back to the server. This two-stage human approval (pre- and post-sampling) is a core safety principle
workos.com
modelcontextprotocol.io
.

Fig: MCP client workflow. The client loads tool definitions into the LLM’s context and mediates all communication. In each step, the model may output a tool call, the client executes it on the server, then feeds the result back into the model
anthropic.com
.

Multi-Tool Orchestration Patterns

Modern AI often chains multiple tools or agents. Popular frameworks include LangChain (Python library for chains-of-thought and function/tool chaining), Haystack and LlamaIndex (often used for RAG/text retrieval and chaining), AutoGen (Microsoft’s multi-agent chat framework), CrewAI (open-source multi-agent workflows), and even general workflow engines like Temporal for reliable orchestration. Each takes a different approach: for example, LangChain provides wide tool/language model support and lets the LLM itself choose the next action, while AutoGen and CrewAI focus on structured multi-agent “turn-taking” protocols
clickhouse.com
.

However, MCP Orchestrator (sometimes called NCP or Natural Context Provider) takes a lighter, code-driven approach. Rather than relying on LLM “chain of thought” to sequence tools, MCP Orchestrator lets the developer explicitly compose flows in TypeScript. You import MCP servers as type-safe modules and script the logic (calling tools sequentially or in parallel, handling retries, etc.). In other words, it’s protocol-native: you work directly with MCP messages, not with a higher-level LLM API. The result is more predictability and type safety. As one enthusiast puts it, MCP-agent frameworks assume “simple patterns are more robust than complex architectures”
github.com
. In this model, you bring your own orchestrator code – the LLM is just the “assistant in the loop,” not the conductor of the whole process.

Existing agent libraries: For example, the OpenAI Agents SDK (TypeScript) provides primitives like Agents, Handoffs (delegation), and Guardrails
openai.github.io
. It even features type-safe function tools (auto-generated Zod schemas) and built-in tracing
openai.github.io
openai.github.io
. LangChain and similar libraries instead embed tool schemas in prompts and let the model decide the flow. Temporal (a general workflow engine) can be used under the hood to run agent loops reliably (as in mcp-agent’s Durable Execution mode
github.com
).

MCP Orchestrator differences: In contrast, MCP Orchestrator is very lightweight. It doesn’t impose an LLM-driven loop; the developer’s code decides which tool to call and when. This means you can easily run steps in sequence or parallel, implement retries/timeout policies, and interleave model calls with business logic. It also means you remain vendor-neutral: the orchestrator doesn’t depend on a specific LLM or cloud provider. For example, the NCP (MCP Orchestrator) project is described as “an intelligent orchestration layer that unifies multiple MCP servers into a single gateway” with semantic routing between tools
pulsemcp.com
. This stands in contrast to heavier SDKs – MCP Orchestrator simply treats each server as a type-safe module, and you code the workflow yourself.

Dual-Level Sampling and Security

Allowing one LLM-driven agent to call another (or itself) raises subtle issues. In MCP terms, this is “sampling requests from the server.” Precedents include multi-agent systems where a master agent delegates to sub-agents, or chain-of-thought methods where an LLM calls itself on subtasks. OpenAI’s Agents SDK explicitly supports handoffs, letting an agent delegate a sub-problem to another agent
openai.github.io
. Anthropic’s Claude can generate and execute code (as above) to offload heavy work. Custom proxy layers have also emerged: for example, one could interpose a proxy between the client and LLM to inspect or filter prompts and completions.

Security best practices are critical in this dual-level setting. MCP’s spec and guides emphasize user control, origin-checking, and rate/cost limits. For instance, servers must obtain explicit user consent before any LLM sampling or tool call
modelcontextprotocol.io
. The client should show exactly what prompt will be sent and what result was received, and let the user approve or deny each one (the “human-in-the-loop” design)
modelcontextprotocol.io
workos.com
. Origin header validation and authentication on servers are required to prevent cross-site attacks
modelcontextprotocol.io
. Token-passthrough (letting a client hand a fresh access token through the MCP server unchecked) is explicitly forbidden
modelcontextprotocol.io
. Rate limiting and cost controls should be enforced: for example, a proxy or gateway could throttle requests or require the user to pre-approve use of expensive models. Some customers only allow the server to use certain “safe” models or cap total token spend.

In practice, a typical flow might look like this:

sequenceDiagram
    participant Server as MCP Server (Agent)
    participant Client as MCP Client (Host)
    participant LLM as LLM Model
    participant User as End User
    Server->>Client: sampling/createMessage("Tool X")
    Client->>User: "Prompt: Use tool X with args Y?"
    User->>Client: (approve prompt)
    Client->>LLM: send prompt
    LLM-->>Client: return text result
    Client->>User: "Output: [LLM result]"
    User->>Client: (approve output)
    Client->>Server: return result


Here the server’s request triggers two user approvals (pre- and post-sampling)
workos.com
modelcontextprotocol.io
. OpenAI’s recent announcements likewise highlight observability and auditability: their Agents SDK and Responses API provide built-in tracing so developers can inspect exactly which tools were called and what each agent did
openai.com
openai.github.io
. The bottom line is that dual-level sampling should be tightly controlled: design your client to log all calls, require explicit confirmations, and enforce budgets on model usage and tool access.

Type Safety in Agent Tooling

TypeScript and schema validation can make agent code more robust. For example, OpenAI’s TypeScript Agents SDK lets you define function tools with Zod schemas so that both inputs and outputs are statically typed
openai.github.io
. When the agent calls a tool, the response is parsed against the schema; if it doesn’t match, the agent can retry or fail early. This avoids silent errors when the model produces unexpected JSON. In practice, many TS agent frameworks generate types from tool definitions. For instance, MCP Orchestrator can introspect each server’s tool schema and emit corresponding TS types or CLI code, ensuring your code and the LLM’s view stay in sync.

Schema-to-TypeScript tools (like zod-to-ts, quicktype, or tRPC-style frameworks) can automate this further. One can generate TS interfaces from JSON schemas or OpenAPI specs, then derive Zod schemas to validate at runtime. The benefit is clear: compile-time safety, autocomplete, and easier refactoring. The risk, however, is that tool landscapes change rapidly. In a dynamic tool ecosystem, manually written types can become stale if a tool’s signature changes. Over-reliance on types may also give false confidence. It’s wise to complement static typing with runtime checks (Zod) and rigorous testing. In summary, TypeScript-based agents can achieve high reliability using schema validation
openai.github.io
, but one must keep schemas up-to-date and account for the fact that the LLM may misformat output.

Production Use Cases for MCP

MCP is already seeing real-world use in production systems. The official MCP server repository provides many example servers: for instance, there are ready-made servers for a persistent memory store, filesystem operations, Git/Version control, database queries (Postgres/SQLite), search and browser tools, messaging (Slack), mapping (Google Maps), AI image generation, and even AWS-specific tools (e.g. AWS Knowledge Base retrieval using Bedrock)
modelcontextprotocol.io
modelcontextprotocol.io
. You can launch these via npx (e.g. @modelcontextprotocol/server-filesystem, server-github, etc.) and plug them into Claude or any MCP client. This makes it easy to prototype: for example, you might spin up the server-filesystem to let your agent browse project files, and a server-github to read repo history – all on the agent’s command.

Cloud providers are baking MCP support. AWS, for example, published sample MCP servers (Java) for services like Amazon SES
aws.amazon.com
. In their tutorial, the SES MCP server lets an “Amazon Q CLI” agent query your SES email setup or send emails as if you were using the AWS SDK. Similarly, AWS Bedrock has blog posts describing how to expose any REST API via an MCP proxy (e.g. FastMCP) so that AI agents can call it safely
aws.amazon.com
. The MCP Servers list on PulseMCP (modelcontextprotocol site) shows dozens of community and vendor servers: everything from Salesforce, Jira, Trello, to web scraping (Puppeteer) and Google Drive.

In developer workflows, MCP agents can streamline devops and support. For instance, you could write an agent (running as an AWS Lambda or container) that watches logs and auto-documents issues: it calls a log-server MCP to fetch recent errors, then uses Claude via MCP to draft a GitHub issue or respond to a support ticket. GitHub Copilot’s “AI workspaces” could one day use MCP under the hood to let the coding AI fetch code snippets or search repos with context-aware queries. Cost optimization can also factor in: an orchestrator might use a cheaper open-source LLM for initial data gathering (e.g. running a query via a server-database) and a more expensive model only for final summarization. In short, MCP servers (like those for filesystem, GitHub, AWS services) form a toolbox that agents can leverage in many cloud-native scenarios.

Best Practices and Trade-offs

Using multiple LLMs and tools together requires care. Cost and latency must be managed. Fetching all tool schemas and results naively will consume tokens (and time). The Anthropic “code execution” approach highlights this: naively embedding every tool signature bloats the context, whereas loading only needed tools and doing heavy work outside the LLM saves thousands of tokens
anthropic.com
. In practice, only load or call each tool when needed, and prefer smaller models for bulk processing. Cache frequent results (e.g. using resource servers or NCP’s intelligent caching
github.com
) and avoid redundant calls.

For testing, use mocks and logs. Mock out LLM responses and external APIs so you can test your orchestration logic without spending tokens. MCP’s protocol makes this easier: you can simulate a server by sending canned JSON-RPC messages to the client. Similarly, instrument your system: log every LLM prompt and tool call (with provenance) so you can trace back outcomes. Tools like OpenAI’s new tracing/observability (and third-party APMs) help visualize the agent’s execution path
openai.com
openai.github.io
.

Finally, design for flexibility. Don’t hard-code a single LLM vendor: keep your tool-calling layer abstract so you can swap providers or use specialized models. Likewise, avoid locking all logic into MCP if your architecture might evolve. For instance, you could write a thin adapter so your agent code could use either MCP servers or direct API calls, depending on environment. This future-proofs your design against new protocols or on-prem requirements. In general, embrace the MCP model for standardization, but keep integration layers slim and well-abstracted to allow migration or mixing with non-MCP tools down the road.

Sources: Anthropic and MCP documentation
anthropic.com
modelcontextprotocol.io
modelcontextprotocol.io
, blog posts by Anthropic and the community
anthropic.com
workos.com
, AWS and OpenAI official announcements
openai.com
aws.amazon.com
, and MCP spec/reference servers
modelcontextprotocol.io
modelcontextprotocol.io
.