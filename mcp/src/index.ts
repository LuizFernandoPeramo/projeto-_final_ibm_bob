#!/usr/bin/env node
/**
 * DIO Explorer — MCP Server
 *
 * Expõe as trilhas de aprendizado da DIO como ferramentas MCP.
 * Suporta dois transportes:
 *   - stdio  (padrão): usado pelo Bob/Claude localmente
 *   - HTTP   (--http): expõe via Express com StreamableHTTP para acesso remoto (HTTPS/SSO/API)
 *
 * Uso:
 *   node build/index.js              → stdio (Bob local)
 *   node build/index.js --http       → HTTP na porta PORT (default 3000)
 *
 * Variáveis de ambiente (modo HTTP):
 *   PORT             → porta HTTP (default 3000)
 *   MCP_BEARER_TOKEN → token de autenticação Bearer (opcional; sem ele o servidor fica aberto)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface Trilha {
  id: number;
  nome: string;
  tecnologia: string;
  nivel: string;
  carga_horaria_horas: number;
  numero_de_modulos: number;
  modulos: string[];
  certificado: boolean;
  parceiro: string;
  descricao: string;
  url: string;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Carrega dados (resolve relativo ao arquivo compilado em build/)
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.resolve(__dirname, "../../data/trilhas_dio.json");

function loadTrilhas(): Trilha[] {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { trilhas: Trilha[] };
    return parsed.trilhas;
  } catch (err) {
    console.error("[dio-explorer-mcp] Erro ao carregar dados:", err);
    return [];
  }
}

const trilhas: Trilha[] = loadTrilhas();
console.error(`[dio-explorer-mcp] ${trilhas.length} trilhas carregadas.`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trilhaToText(t: Trilha): string {
  return [
    `ID: ${t.id}`,
    `Nome: ${t.nome}`,
    `Tecnologia: ${t.tecnologia}`,
    `Nível: ${t.nivel}`,
    `Carga Horária: ${t.carga_horaria_horas}h`,
    `Módulos (${t.numero_de_modulos}):`,
    ...t.modulos.map((m) => `  - ${m}`),
    `Certificado: ${t.certificado ? "Sim" : "Não"}`,
    `Parceiro: ${t.parceiro}`,
    `Descrição: ${t.descricao}`,
    `URL: ${t.url}`,
    `Tags: ${t.tags.join(", ")}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Factory — cria uma instância fresca do McpServer por sessão (HTTP) ou única (stdio)
// ---------------------------------------------------------------------------

function createServer(): McpServer {
  const server = new McpServer({
    name: "dio-explorer-mcp",
    version: "0.1.0",
  });

  // --- Tool: listar_trilhas ------------------------------------------------
  server.registerTool(
    "listar_trilhas",
    {
      description:
        "Lista todas as trilhas de aprendizado disponíveis na DIO. " +
        "Aceita filtros opcionais por tecnologia, nível e parceiro.",
      inputSchema: {
        tecnologia: z
          .string()
          .optional()
          .describe("Filtrar por tecnologia (ex: Python, Java, React)"),
        nivel: z
          .string()
          .optional()
          .describe("Filtrar por nível: Básico | Intermediário | Avançado"),
        parceiro: z
          .string()
          .optional()
          .describe("Filtrar por parceiro (ex: DIO, Microsoft, AWS)"),
      },
    },
    async ({ tecnologia, nivel, parceiro }) => {
      let resultado = trilhas;

      if (tecnologia) {
        resultado = resultado.filter((t) =>
          t.tecnologia.toLowerCase().includes(tecnologia.toLowerCase())
        );
      }
      if (nivel) {
        resultado = resultado.filter((t) =>
          t.nivel.toLowerCase().includes(nivel.toLowerCase())
        );
      }
      if (parceiro) {
        resultado = resultado.filter((t) =>
          t.parceiro.toLowerCase().includes(parceiro.toLowerCase())
        );
      }

      if (resultado.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Nenhuma trilha encontrada para os filtros informados.",
            },
          ],
        };
      }

      const linhas = resultado.map(
        (t) =>
          `[${t.id}] ${t.nome} | ${t.tecnologia} | ${t.nivel} | ${t.carga_horaria_horas}h | Parceiro: ${t.parceiro}`
      );

      return {
        content: [
          {
            type: "text",
            text: `${resultado.length} trilha(s) encontrada(s):\n\n${linhas.join("\n")}`,
          },
        ],
      };
    }
  );

  // --- Tool: detalhar_trilha -----------------------------------------------
  server.registerTool(
    "detalhar_trilha",
    {
      description:
        "Retorna todos os detalhes de uma trilha específica, incluindo lista completa de módulos, descrição e URL.",
      inputSchema: {
        id: z.number().describe("ID numérico da trilha"),
      },
    },
    async ({ id }) => {
      const trilha = trilhas.find((t) => t.id === id);
      if (!trilha) {
        return {
          content: [
            {
              type: "text",
              text: `Trilha com ID ${id} não encontrada. Use listar_trilhas para ver os IDs disponíveis.`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: trilhaToText(trilha) }],
      };
    }
  );

  // --- Tool: buscar_trilhas ------------------------------------------------
  server.registerTool(
    "buscar_trilhas",
    {
      description:
        "Busca trilhas por palavra-chave em nome, descrição, tags e módulos.",
      inputSchema: {
        query: z.string().describe("Palavra-chave para busca livre"),
      },
    },
    async ({ query }) => {
      const q = query.toLowerCase();
      const resultado = trilhas.filter(
        (t) =>
          t.nome.toLowerCase().includes(q) ||
          t.descricao.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          t.modulos.some((m) => m.toLowerCase().includes(q))
      );

      if (resultado.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Nenhuma trilha encontrada para "${query}".`,
            },
          ],
        };
      }

      const linhas = resultado.map(
        (t) =>
          `[${t.id}] ${t.nome} (${t.tecnologia} · ${t.nivel})\n  ${t.descricao}`
      );

      return {
        content: [
          {
            type: "text",
            text: `${resultado.length} trilha(s) encontrada(s) para "${query}":\n\n${linhas.join("\n\n")}`,
          },
        ],
      };
    }
  );

  // --- Tool: estatisticas_trilhas ------------------------------------------
  server.registerTool(
    "estatisticas_trilhas",
    {
      description:
        "Retorna estatísticas gerais sobre o catálogo: total de trilhas, tecnologias, níveis, parceiros e carga horária total.",
      inputSchema: {},
    },
    async () => {
      const tecnologias = [...new Set(trilhas.map((t) => t.tecnologia))].sort();
      const niveis = [...new Set(trilhas.map((t) => t.nivel))].sort();
      const parceiros = [...new Set(trilhas.map((t) => t.parceiro))].sort();
      const totalHoras = trilhas.reduce(
        (acc, t) => acc + t.carga_horaria_horas,
        0
      );
      const comCertificado = trilhas.filter((t) => t.certificado).length;

      const texto = [
        `Total de trilhas: ${trilhas.length}`,
        `Carga horária total: ${totalHoras}h`,
        `Trilhas com certificado: ${comCertificado}`,
        ``,
        `Tecnologias (${tecnologias.length}): ${tecnologias.join(", ")}`,
        ``,
        `Níveis: ${niveis.join(", ")}`,
        ``,
        `Parceiros: ${parceiros.join(", ")}`,
      ].join("\n");

      return {
        content: [{ type: "text", text: texto }],
      };
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Bootstrap: stdio (padrão) ou HTTP (--http)
// ---------------------------------------------------------------------------

const useHttp = process.argv.includes("--http");

if (useHttp) {
  // ---- Modo HTTP com StreamableHTTP Transport ----
  // Requer que o servidor fique atrás de um reverse proxy com TLS para HTTPS.
  const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
  const BEARER_TOKEN = process.env["MCP_BEARER_TOKEN"];

  const { default: express } = await import("express");
  const app = express();
  app.use(express.json());

  // Middleware de autenticação via Bearer Token (opcional)
  app.use((req, res, next) => {
    if (!BEARER_TOKEN) return next();
    const auth = req.headers["authorization"];
    if (auth === `Bearer ${BEARER_TOKEN}`) return next();
    res.status(401).json({ error: "Unauthorized" });
    return;
  });

  // Health-check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      server: "dio-explorer-mcp",
      version: "0.1.0",
      trilhas: trilhas.length,
    });
  });

  // Endpoint MCP — cria uma sessão por request
  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  app.listen(PORT, () => {
    console.error(`[dio-explorer-mcp] HTTP server escutando na porta ${PORT}`);
    console.error(`[dio-explorer-mcp] Health: http://localhost:${PORT}/health`);
    console.error(`[dio-explorer-mcp] MCP endpoint: http://localhost:${PORT}/mcp`);
    if (!BEARER_TOKEN) {
      console.error(
        "[dio-explorer-mcp] AVISO: MCP_BEARER_TOKEN não configurado — servidor sem autenticação!"
      );
    }
  });
} else {
  // ---- Modo stdio (padrão) ----
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[dio-explorer-mcp] Servidor MCP rodando via stdio");
}
