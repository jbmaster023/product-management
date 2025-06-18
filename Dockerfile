FROM node:18-alpine

WORKDIR /app

RUN npm install -g http-server

COPY index.html ./

EXPOSE 3052

# Usar http-server que es más confiable para acceso de red
CMD ["http-server", ".", "-p", "3052", "-a", "0.0.0.0"]