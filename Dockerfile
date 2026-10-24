
# Usar la imagen oficial de Node.js
FROM node:18-slim

# Crear el directorio de trabajo en el contenedor
WORKDIR /usr/src/app

# Copiar los archivos de dependencias
COPY package*.json ./

# Instalar las dependencias del proyecto
RUN npm install --only=production

# Copiar el resto del código de la aplicación
COPY . .

# Exponer el puerto por defecto de Cloud Run
EXPOSE 8080

# Comando para iniciar la aplicación
CMD [ "npm", "start" ]
