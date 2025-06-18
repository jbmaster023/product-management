FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Exponer puerto 3053 (no 80)
EXPOSE 3053

# Variable de entorno por defecto
ENV PORT=3053

CMD ["node", "server.js"]