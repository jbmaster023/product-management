FROM node:18-alpine

WORKDIR /app

# Copiar package.json primero
COPY package.json ./

# Instalar dependencias
RUN npm install

# Copiar TODOS los archivos
COPY . .

# Verificar que server.js existe (debugging)
RUN ls -la /app/

# Exponer puerto
EXPOSE 3053

# Comando de inicio
CMD ["node", "server.js"]