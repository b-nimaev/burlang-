import express from "express";
import { Context, Scenes, session, Telegraf } from "telegraf";
import dotenv from "dotenv";
import path from "path"; // Модуль path может понадобиться для работы с путями
import bodyParser from "body-parser";
import morgan from "morgan";

// Создаем интерфейс для пользовательского контекста с учетом сцен
interface MyContext extends Context {
  scene: Scenes.SceneContextScene<MyContext>;
  session: Scenes.SceneSession<MyContext>;
}

dotenv.config(); // Загружаем переменные окружения

const app = express();
app.use(bodyParser.json());
app.use(morgan("dev"));
const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN || "");
const secretPath = process.env.secret_path || "/telegraf/secret_path";
const port = process.env.PORT || 3000;
const mode = process.env.mode || "development";

// Функция для установки вебхука
const setWebhook = async (url: string) => {
  try {
    await bot.telegram.setWebhook(`${url}/${secretPath}`);
    console.log(`Webhook установлен: ${url}/${secretPath}`);
  } catch (error) {
    console.error("Ошибка при установке вебхука:", error);
  }
};

// Конфигурация для разных режимов
if (mode === "development") {
  // В режиме разработки используется ngrok для получения публичного URL
  const fetchNgrokUrl = async () => {
    try {
      const res = await fetch("http://127.0.0.1:4040/api/tunnels"); // Проверяем URL ngrok
      const json = await res.json();
      const secureTunnel = json.tunnels[0].public_url; // Получаем публичный URL
      console.log(`Ngrok URL: ${secureTunnel}`);

      await setWebhook(secureTunnel); // Устанавливаем вебхук через ngrok URL
    } catch (error) {
      console.error("Ошибка при получении URL из ngrok:", error);
    }
  };

  fetchNgrokUrl(); // Вызываем функцию получения URL из ngrok
} else if (mode === "production") {
  // В продакшн-режиме используется site_url из переменных окружения
  const siteUrl = process.env.site_url || "https://example.com";

  // Объединяем site_url и secret_path правильно
  setWebhook(`${siteUrl}${secretPath.startsWith("/") ? "" : "/"}${secretPath}`);
}

// Middleware для обработки запросов от Telegram
app.use(express.json());
app.use(`/${secretPath}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port} в режиме ${mode}`);
});

// Создание основной сцены (главная сцена)
const homeScene = new Scenes.BaseScene<MyContext>('home');
homeScene.enter((ctx) => ctx.reply('Вы находитесь на главной странице.'));
homeScene.hears('Словарь', (ctx) => ctx.scene.enter('dictionary'));
homeScene.hears('Предложения', (ctx) => ctx.scene.enter('sentences'));
homeScene.hears('Личный кабинет', (ctx) => ctx.scene.enter('dashboard'));
homeScene.hears('Самоучитель', (ctx) => ctx.scene.enter('self-teacher'));
homeScene.leave((ctx) => ctx.reply('Покидаем главную сцену.'));

// Создание сцены "Словарь"
const dictionaryScene = new Scenes.BaseScene<MyContext>('dictionary');
dictionaryScene.enter((ctx) => ctx.reply('Добро пожаловать в словарь. Введите слово для поиска.'));
dictionaryScene.leave((ctx) => ctx.reply('Вы покинули словарь.'));
dictionaryScene.hears('Главная', (ctx) => ctx.scene.enter('home'));

// Создание сцены "Предложения"
const sentencesScene = new Scenes.BaseScene<MyContext>('sentences');
sentencesScene.enter((ctx) => ctx.reply('Добро пожаловать в раздел предложений.'));
sentencesScene.leave((ctx) => ctx.reply('Вы покинули раздел предложений.'));
sentencesScene.hears('Главная', (ctx) => ctx.scene.enter('home'));

// Создание сцены "Личный кабинет"
const dashboardScene = new Scenes.BaseScene<MyContext>('dashboard');
dashboardScene.enter((ctx) => ctx.reply('Вы находитесь в личном кабинете.'));
dashboardScene.leave((ctx) => ctx.reply('Вы покинули личный кабинет.'));
dashboardScene.hears('Главная', (ctx) => ctx.scene.enter('home'));

// Создание сцены "Самоучитель"
const selfTeacherScene = new Scenes.BaseScene<MyContext>('self-teacher');
selfTeacherScene.enter((ctx) => ctx.reply('Добро пожаловать в самоучитель.'));
selfTeacherScene.leave((ctx) => ctx.reply('Вы покинули самоучитель.'));
selfTeacherScene.hears('Главная', (ctx) => ctx.scene.enter('home'));

// Создание Stage для управления сценами
const stage = new Scenes.Stage<MyContext>([
  homeScene,
  dictionaryScene,
  sentencesScene,
  dashboardScene,
  selfTeacherScene
], {
    default: 'home'
});

// Использование middleware сессий и сцен
bot.use(session());
bot.use(stage.middleware());