# Usamos una imagen ligera de Node.js
FROM node:20-slim

# Creamos el directorio de la app
WORKDIR /usr/src/app

# Copiamos los archivos de dependencias
COPY package*.json ./

# Instalamos las dependencias del proyecto
RUN npm install

# Copiamos el resto del código de la aplicación (incluyendo la carpeta src)
COPY . .

# Exponemos el puerto que pide Cloud Run
EXPOSE 8080

# Comando para arrancar la aplicación
CMD [ "npm", "start" ]
