FROM node:22-alpine

WORKDIR /app
COPY . .

RUN mkdir -p /app/civicchain/data && chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=4173
ENV CIVICCHAIN_DATA_DIR=/app/civicchain/data
ENV ALLOW_DEMO_ACCOUNTS=true
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4173) + '/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "civicchain/server.js"]
