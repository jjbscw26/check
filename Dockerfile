# Usar la imagen oficial de Bun
FROM oven/bun:1
WORKDIR /app

# Copiar archivos de dependencias
COPY package.json bun.lock ./
RUN bun install

# Copiar todo el código del proyecto
COPY . .

# Construir la aplicación para producción
RUN bun run build

# Exponer el puerto oficial de Cloud Run
EXPOSE 8080
ENV PORT=8080

# Comando definitivo para arrancar el servidor de Vite en producción
CMD ["bun", "run", "preview", "--host", "0.0.0.0", "--port", "8080"]
