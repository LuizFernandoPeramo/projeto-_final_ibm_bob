# DIO Explorer — MCP Server

Servidor MCP que expõe as trilhas de aprendizado da DIO como ferramentas acessíveis pelo Bob (Claude) e por qualquer cliente MCP compatível.

## Estrutura

```
mcp/
├── src/
│   └── index.ts       # Código-fonte TypeScript
├── build/
│   └── index.js       # Saída compilada (gerada por `npm run build`)
├── package.json
├── tsconfig.json
└── README.md
```

## Ferramentas disponíveis

| Tool | Descrição |
|---|---|
| `listar_trilhas` | Lista trilhas com filtros opcionais por tecnologia, nível e parceiro |
| `detalhar_trilha` | Retorna detalhes completos de uma trilha pelo ID |
| `buscar_trilhas` | Busca por palavra-chave em nome, descrição, tags e módulos |
| `estatisticas_trilhas` | Estatísticas gerais do catálogo |

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Compilar
npm run build

# Testar via stdio (modo local/Bob)
npm start

# Iniciar em modo HTTP (porta 3000)
npm run start:http
```

## Transportes

### 1. stdio (padrão — Bob local)

Utilizado pelo Bob automaticamente via `.bob/mcp.json`. Nenhuma configuração extra necessária.

### 2. HTTP — acesso remoto (HTTPS / SSO / API)

Inicia o servidor em modo HTTP com transporte `StreamableHTTP` compatível com a especificação MCP 2025-03.

```bash
# Porta padrão 3000
node build/index.js --http

# Porta customizada
PORT=8080 node build/index.js --http

# Com autenticação Bearer Token
MCP_BEARER_TOKEN=seu_token_aqui node build/index.js --http
```

#### Endpoints

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/health` | Health-check do servidor |
| `POST` | `/mcp` | Endpoint principal MCP (StreamableHTTP) |
| `GET` | `/mcp` | SSE / streaming MCP |
| `DELETE` | `/mcp` | Encerramento de sessão MCP |

#### Exemplo de requisição via curl

```bash
curl http://localhost:3000/health
```

### HTTPS em produção

Para expor via HTTPS, coloque o servidor atrás de um reverse proxy como **nginx** ou **Caddy**:

**Caddy** (mais simples — TLS automático):
```
api.seudominio.com {
    reverse_proxy localhost:3000
}
```

### Autenticação SSO / API

O servidor suporta autenticação via **Bearer Token**:

```bash
MCP_BEARER_TOKEN=meu_token_secreto node build/index.js --http
```

Clientes devem enviar:
```
Authorization: Bearer meu_token_secreto
```

Para integrar com SSO (ex: Keycloak, Auth0, Entra ID), coloque um API Gateway ou proxy de autenticação na frente do servidor que valide o JWT e repasse a requisição autenticada.

## Registro no Bob (mcp.json de workspace)

O servidor já está registrado em `.bob/mcp.json`:

```json
{
  "mcpServers": {
    "dio-explorer": {
      "command": "node",
      "args": ["<caminho absoluto>/dio_explorer/mcp/build/index.js"]
    }
  }
}
```

Para registro remoto (após subir o servidor HTTP):

```json
{
  "mcpServers": {
    "dio-explorer-remote": {
      "url": "https://api.seudominio.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:DIO_EXPLORER_TOKEN}"
      }
    }
  }
}
```
