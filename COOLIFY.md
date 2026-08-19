# 🚀 Guia de Deploy no Coolify (Passo a Passo)

Este projeto está 100% pronto e otimizado para ser implantado no **Coolify** com suporte a persistência do banco de dados **SQLite** em volume Docker.

---

## 🛠️ Método 1: Deploy direto via Repositório Git (Recomendado)

1. **Acesse seu painel do Coolify**:
   - Vá em **Projects** > Escolha seu projeto/ambiente.
   - Clique em **+ New** > **Resource** > **Public/Private Repository** (GitHub / GitLab / Git).

2. **Selecione o Repositório**:
   - Cole a URL do repositório onde este código foi enviado.
   - Branch: `main` (ou a branch desejada).

3. **Configurações no Coolify**:
   - **Build Pack**: Selecione **Dockerfile** (já configurado no projeto) ou **Docker Compose**.
   - **Ports Exposes**: `3000`
   - **Health Check Path**: `/health`

4. **Configuração de Persistência (MUITO IMPORTANTE PARA O SQLITE)**:
   - No painel da sua aplicação no Coolify, vá na aba **Storages** (ou **Persistent Storage**).
   - Adicione um volume para que os dados do sorteio não se percam a cada novo deploy:
     - **Destination Path**: `/app/data`
     - **Name**: `sorteio-sqlite-data`
   - Salve a configuração.

5. **Variáveis de Ambiente (Environment Variables)**:
   - Adicione se desejar:
     ```env
     NODE_ENV=production
     PORT=3000
     TZ=America/Sao_Paulo
     ```

6. **Defina seu Domínio (FQDN)**:
   - No campo **Domains**, adicione o domínio ou subdomínio (ex: `https://sorteio.seudominio.com`). O Coolify irá gerar o certificado SSL/HTTPS automaticamente via Let's Encrypt / Traefik.

7. **Clique em Deploy**:
   - O Coolify executará o `Dockerfile` multi-stage, construirá o frontend com Vite e inicializará o servidor Express com o SQLite ativo.

---

## 🐳 Método 2: Deploy com Docker Compose no Coolify

Caso prefira usar Docker Compose dentro do Coolify:

1. No Coolify, clique em **+ New** > **Docker Compose**.
2. Cole o conteúdo do arquivo `docker-compose.yml` que já acompanha o projeto.
3. Defina o seu domínio em **Domains**.
4. Clique em **Deploy**.

---

## 📋 Verificação pós-deploy

Após o deploy:
- A rota `/health` responde `{"status":"ok"}`.
- O banco SQLite será salvo no caminho `/app/data/sorteio.sqlite` mantendo o histórico de dias, vagas e consultores mesmo após reinicializações.
- Toda a sincronização em tempo real funcionará perfeitamente.
