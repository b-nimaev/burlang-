import express from "express";
import { Markup, Scenes, session, Telegraf } from "telegraf";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import morgan from "morgan";
import { MyContext } from "./types/MyContext";
import dictionaryWizard from "./scenes/dictionaryWizard";
import dashboardWizard from "./scenes/dashboardWizard";

dotenv.config(); // Загружаем переменные окружения

const app = express();
app.use(bodyParser.json());
app.use(morgan("dev"));
const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN || "");
const secretPath = `/${process.env.secret_path}` || "/telegraf/secret_path";
const port = process.env.PORT || 3000;
const mode = process.env.mode || "development";

// Функция для установки вебхука
const setWebhook = async (url: string) => {
  try {
    await bot.telegram.setWebhook(`${url}${secretPath}`);
    console.log(`Webhook установлен: ${url}${secretPath}`);
  } catch (error) {
    console.error("Ошибка при установке вебхука:", error);
  }
};

// Конфигурация для разных режимов
if (mode === "development") {
  const fetchNgrokUrl = async () => {
    try {
      const res = await fetch("http://127.0.0.1:4040/api/tunnels");
      const json: any = await res.json();
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
  setWebhook(`${siteUrl}`);
}

// Middleware для обработки запросов от Telegram
app.use(express.json());
app.use(`${secretPath}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

app.get(`hello`, async (_res, req) => {
  req.send(`Hello world!`)
})

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port} в режиме ${mode}`);
});

const homeKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.webApp("Самоучитель", "https://burlive.ru"), // Замените на ваш URL веб-приложения
    Markup.button.callback("Словарь", "dictionary"),
  ],
  [Markup.button.callback("Предложения", "sentences")],
  [Markup.button.callback("Личный кабинет", "dashboard")],
]);

// Функция для отправки или редактирования сообщений
export const sendOrEditMessage = async (
  ctx: MyContext,
  text: string,
  buttons?: ReturnType<typeof Markup.inlineKeyboard>,
  reply?: boolean
) => {
  const inlineKeyboard = buttons?.reply_markup?.inline_keyboard || []; // Убедитесь, что кнопки существуют или используем пустой массив

  if (reply) {
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineKeyboard },
      link_preview_options: {
        is_disabled: true
      }
    });
  } else {
    if (ctx.updateType === "callback_query") {
      try {
        await ctx.editMessageText(text, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: inlineKeyboard, // Передаем массив кнопок
          },
          link_preview_options: {
            is_disabled: true,
          },
        });
      } catch (err) {
        // Игнорируем ошибку, если сообщение уже было отредактировано
      }
    } else {
      await ctx.reply(text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: inlineKeyboard },
        link_preview_options: {
          is_disabled: true,
        },
      });
    }
  }
};

// Создание основной сцены (главная сцена)
const homeScene = new Scenes.BaseScene<MyContext>("home");
homeScene.enter((ctx) =>
  sendOrEditMessage(
    ctx,
    `<b>Самоучитель бурятского языка</b>\n\nКаждое взаимодействие с ботом, 
влияет на сохранение и дальнейшее развитие Бурятского языка\n\nВыберите раздел, чтобы приступить`,
    homeKeyboard
  )
);
homeScene.on("message", async (ctx) => sendOrEditMessage(
  ctx,
  `<b>Самоучитель бурятского языка</b>\n\nКаждое взаимодействие с ботом, 
влияет на сохранение и дальнейшее развитие Бурятского языка\n\nВыберите раздел, чтобы приступить`,
  homeKeyboard
))

// Создание сцены "Предложения"
const sentencesScene = new Scenes.BaseScene<MyContext>("sentences");
sentencesScene.enter((ctx) => {
  sendOrEditMessage(
    ctx,
    "Добро пожаловать в раздел предложений.",
    Markup.inlineKeyboard([[Markup.button.callback("Главная", "home")]])
  );
});

// Создание сцены "Личный кабинет"
const dashboardScene = new Scenes.BaseScene<MyContext>("dashboard");
dashboardScene.enter((ctx) => {
  sendOrEditMessage(
    ctx,
    "Вы находитесь в личном кабинете.",
    Markup.inlineKeyboard([[Markup.button.callback("Главная", "home")]])
  );
});

// Создание сцены "Самоучитель"
const selfTeacherScene = new Scenes.BaseScene<MyContext>("self-teacher");
selfTeacherScene.enter((ctx) => {
  sendOrEditMessage(
    ctx,
    "Добро пожаловать в самоучитель.",
    Markup.inlineKeyboard([[Markup.button.callback("Главная", "home")]])
  );
});

// Создание Stage для управления сценами
const stage = new Scenes.Stage<MyContext>([
  homeScene,
  dictionaryWizard,
  sentencesScene,
  dashboardWizard,
  selfTeacherScene,
]);

// Использование middleware сессий и сцен
bot.use(session());
bot.use(stage.middleware());

const apiUrl = process.env.api_url || 'http://express-api:5000';

bot.start(async (ctx) => {
  try {
    console.log(ctx.from)
    const getuser = await fetch(
      `${apiUrl}/telegram/user/is-exists/${ctx.from.id}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.admintoken}`,
        },
      }
    );

    const fetchuserResult: any = await getuser.json()

    if (fetchuserResult.is_exists === false) {

      const createTelegramUser = await fetch(`${apiUrl}/telegram/create-user/`,
        {
          method: 'POST',
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.admintoken}`,
          },
          body: JSON.stringify(ctx.from)
        }
      )

      const createTelegramUserResult = await createTelegramUser.json()

      console.log(createTelegramUserResult)
    }

    console.log(fetchuserResult)

    ctx.scene.enter("home")

  } catch (error) {
    console.log(error)
  }
});

// Обработка callback для инлайн-кнопок
bot.action("home", (ctx) => ctx.scene.enter("home"));
bot.action("dictionary", (ctx) => ctx.scene.enter("dictionary-wizard"));
bot.action("sentences", (ctx) => ctx.scene.enter("sentences"));
bot.action("dashboard", (ctx) => ctx.scene.enter("dashboard-wizard"));
bot.action("self-teacher", (ctx) => {
  // Ответьте на callback_query, чтобы убрать индикатор загрузки на кнопке
  ctx.answerCbQuery();

  // Отправьте сообщение с кнопкой web_app
  return ctx.reply('Откройте веб-приложение, нажав на кнопку ниже:', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть веб-приложение',
            web_app: {
              url: 'https://your-web-app-url.com' // Замените на URL вашего веб-приложения
            }
          }
        ]
      ]
    }
  });
});

bot.on("message", async (ctx: MyContext) => await ctx.scene.enter("home"))