FROM node:18-alpine

WORKDIR /app

# Copiar package.json
COPY package*.json ./

# Instalar dependencias (usar install en lugar de ci)
RUN npm install --only=production

# Copiar el código de la aplicación
COPY . .

# Exponer el puerto
EXPOSE 3000

# Comando para ejecutar la aplicación
CMD ["npm", "start"]