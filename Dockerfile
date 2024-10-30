FROM node:18

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем остальной исходный код
COPY . .

# Собираем приложение
RUN npx tsc

# Экспонируем порт
EXPOSE 1337

# Запускаем приложение
CMD ["npm", "start"]
