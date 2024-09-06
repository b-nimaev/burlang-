import express from "express";
import { Context, Markup, Scenes, session, Telegraf } from "telegraf";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import morgan from "morgan";
import { MyContext } from "./types/MyContext";
import dictionaryWizard from "./scenes/dictionaryWizard";

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
  const fetchNgrokUrl = async () => {
    try {
      const res = await fetch("http://127.0.0.1:4040/api/tunnels");
      const json = await res.json();
      const secureTunnel = json.tunnels[0].public_url;
      console.log(`Ngrok URL: ${secureTunnel}`);
      await setWebhook(secureTunnel);
    } catch (error) {
      console.error("Ошибка при получении URL из ngrok:", error);
    }
  };
  fetchNgrokUrl();
} else if (mode === "production") {
  const siteUrl = process.env.site_url || "https://example.com";
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

// Создание инлайн-кнопок для главной сцены
const homeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Словарь", "dictionary")],
  [Markup.button.callback("Предложения", "sentences")],
  [Markup.button.callback("Личный кабинет", "dashboard")],
  [Markup.button.callback("Самоучитель", "self-teacher")],
]);

// Функция для отправки или редактирования сообщений
export const sendOrEditMessage = async (ctx: MyContext, text: string, buttons?: ReturnType<typeof Markup.inlineKeyboard>) => {
  const inlineKeyboard = buttons?.reply_markup?.inline_keyboard || []; // Убедитесь, что кнопки существуют или используем пустой массив

  if (ctx.updateType === 'callback_query') {
    try {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: {
        inline_keyboard: inlineKeyboard // Передаем массив кнопок
      } });
    } catch (err) {
      // Игнорируем ошибку, если сообщение уже было отредактировано
    }
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: inlineKeyboard } });
  }
};


// Создание основной сцены (главная сцена)
const homeScene = new Scenes.BaseScene<MyContext>('home');
homeScene.enter((ctx) =>
  sendOrEditMessage(
    ctx,
    `<b>Самоучитель бурятского языка</b>\n\nКаждое взаимодействие с ботом, 
влияет на сохранение и дальнейшее развитие Бурятского языка\n\nВыберите раздел, чтобы приступить`,
    homeKeyboard
  )
);

// Создание сцены "Предложения"
const sentencesScene = new Scenes.BaseScene<MyContext>('sentences');
sentencesScene.enter((ctx) => {
  sendOrEditMessage(ctx, 'Добро пожаловать в раздел предложений.', Markup.inlineKeyboard([
    [Markup.button.callback('Главная', 'home')]
  ]));
});

// Создание сцены "Личный кабинет"
const dashboardScene = new Scenes.BaseScene<MyContext>('dashboard');
dashboardScene.enter((ctx) => {
  sendOrEditMessage(ctx, 'Вы находитесь в личном кабинете.', Markup.inlineKeyboard([
    [Markup.button.callback('Главная', 'home')]
  ]));
});

// Создание сцены "Самоучитель"
const selfTeacherScene = new Scenes.BaseScene<MyContext>('self-teacher');
selfTeacherScene.enter((ctx) => {
  sendOrEditMessage(ctx, 'Добро пожаловать в самоучитель.', Markup.inlineKeyboard([
    [Markup.button.callback('Главная', 'home')]
  ]));
});

// Создание Stage для управления сценами
const stage = new Scenes.Stage<MyContext>([
  homeScene,
  dictionaryWizard,
  sentencesScene,
  dashboardScene,
  selfTeacherScene,
]);

// Использование middleware сессий и сцен
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => ctx.scene.enter("home"));

// Обработка callback для инлайн-кнопок
bot.action("home", (ctx) => ctx.scene.enter("home"));
bot.action("dictionary", (ctx) => ctx.scene.enter("dictionary-wizard"));
bot.action("sentences", (ctx) => ctx.scene.enter("sentences"));
bot.action("dashboard", (ctx) => ctx.scene.enter("dashboard"));
bot.action("self-teacher", (ctx) => ctx.scene.enter("self-teacher"));
