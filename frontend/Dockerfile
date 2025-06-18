FROM node:18-alpine
WORKDIR /app
RUN npm install -g serve@14.2.0
COPY index.html ./
EXPOSE 3052
CMD ["serve", "-s", ".", "-l", "3052"]