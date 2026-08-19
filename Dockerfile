# Multi-stage Dockerfile para Coolify / Docker
FROM node:20-alpine AS builder

WORKDIR /app

# Instala curl para healthcheck
RUN apk add --no-cache curl

# Copia manifestos de pacotes
COPY package.json package-lock.json* ./

# Instala todas as dependências necessárias para o build
RUN npm install

# Copia o código-fonte da aplicação
COPY . .

# Compila o frontend React com Vite para a pasta /app/dist
RUN npm run build

# Compila o server TypeScript para JavaScript standalone usando esbuild
RUN npx esbuild server.ts --bundle --platform=node --target=node20 --format=esm --packages=external --outfile=dist-server/server.mjs

# Stage de Produção
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl wget

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copia package.json
COPY package.json package-lock.json* ./

# Instala dependências de produção
RUN npm install --omit=dev

# Copia o build do frontend e o servidor JavaScript compilado
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# Cria o diretório de dados persistentes para o SQLite
RUN mkdir -p /app/data && chmod 777 /app/data

# Volume persistente para o banco SQLite
VOLUME ["/app/data"]

EXPOSE 3000

# Healthcheck usando 127.0.0.1 explícito (evita problema de resolução IPv6 ::1 no Alpine)
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || curl -f http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist-server/server.mjs"]
