FROM node:18-alpine

WORKDIR /app

RUN npm install -g serve@14.2.0

COPY index.html ./
COPY package.json ./

# Cambiar puerto a 8080
EXPOSE 8080

# Usar puerto 8080 y bind a todas las interfaces
CMD ["serve", "-s", ".", "-l", "3010", "--host", "0.0.0.0"]