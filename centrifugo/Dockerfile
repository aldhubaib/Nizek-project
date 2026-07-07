FROM centrifugo/centrifugo:v6

COPY config.json /centrifugo/config.json

# Centrifugo listens on 8000 by default; map Railway's PORT via
# CENTRIFUGO_HTTP_SERVER_PORT. Redis engine address is provided via
# CENTRIFUGO_ENGINE_REDIS_ADDRESS. HMAC secret + API key come from
# CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY and CENTRIFUGO_HTTP_API_KEY.
EXPOSE 8000

CMD ["centrifugo", "-c", "/centrifugo/config.json"]
