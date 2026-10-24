# Usar la imagen oficial de Bun
FROM oven/bun:1 as base
WORKDIR /usr/src/app

# Copiar archivos de dependencias
COPY package.json bun.lock ./

# Instalar dependencias
RUN bun install --frozen-lockfile

# Copiar el resto del código
COPY . .

# Construir la aplicación (Vite)
RUN bun run build

# Puerto requerido por Cloud Run
EXPOSE 8080

# Comando para arrancar el servidor
CMD ["bun", "run", "preview", "--host", "0.0.0.0", "--port", "8080"]
