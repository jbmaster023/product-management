FROM node:18-alpine

WORKDIR /app

RUN npm install -g serve@14.2.0

COPY index.html ./

# Cambiar puerto a 3052
EXPOSE 3052

# Comando con puerto 3052
CMD ["serve", "-s", ".", "-l", "3052"]