# Multi-stage Dockerfile para Coolify / Docker
FROM node:20-alpine AS builder

WORKDIR /app

# Copia manifestos de pacotes
COPY package.json package-lock.json* ./

# Instala todas as dependências necessárias para o build
RUN npm install

# Copia o código-fonte da aplicação
COPY . .

# Compila o frontend React com Vite para a pasta /app/dist
RUN npm run build

# Stage de Produção
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copia package.json
COPY package.json package-lock.json* ./

# Instala dependências de produção
RUN npm install --omit=dev

# Copia o build do frontend e o código do servidor
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Cria o diretório de dados persistentes para o SQLite
RUN mkdir -p /app/data && chmod 777 /app/data

# Volume persistente para o banco SQLite
VOLUME ["/app/data"]

EXPOSE 3000

# Healthcheck para Coolify / Traefik
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["npm", "start"]
