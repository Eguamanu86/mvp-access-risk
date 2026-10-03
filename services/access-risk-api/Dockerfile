FROM node:24-alpine

# Ambiente productivo por defecto
ENV NODE_ENV=production

# Directorio de trabajo
WORKDIR /app

# Copiar manifiestos primero (cache de capas)
COPY package.json package-lock.json ./

# Configurar permisos antes de instalar y cambiar a usuario no root
RUN chown -R node:node .
USER node

# Instalar dependencias de produccion (build reproducible segun el lock)
RUN npm ci --omit=dev

# Copiar el resto del codigo fuente
COPY --chown=node:node . .

EXPOSE 8080

CMD [ "npm", "run", "start" ]
