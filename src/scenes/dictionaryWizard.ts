import { Composer, Scenes, Markup } from "telegraf";
import { MyContext } from "../types/MyContext";
import { sendOrEditMessage } from "..";

// Описываем тип для состояния Wizard-сцены
interface WizardState {
  language?: string;
  suggestion?: boolean;
}

// Обработчик для начальной сцены
const handler = new Composer<MyContext>();

// Сцена "Словарь"
const dictionaryWizard = new Scenes.WizardScene<
  MyContext & { wizard: { state: WizardState } }
>(
  "dictionary-wizard",
  handler,

  // Шаг 1: Получение userInput от пользователя и перевод слова
  async (ctx) => {
    if (ctx.message && "text" in ctx.message) {
      const userInput = ctx.message.text;

      // Логика обращения к API для перевода
      const language = ctx.wizard.state.language;
      // const translation = await yourApiTranslateFunction(userInput, language); // вызов API для перевода

      await ctx.reply(`Перевод для "${userInput}" с ${language}: ${userInput}`);
      return ctx.scene.enter("dictionary-wizard"); // Переход на главную после обработки
    } else {
      await ctx.reply("Пожалуйста, введите текст.");
    }
  },

  // Шаг 2: Обработка введённого слова и отправка на API
  async (ctx) => {
    if (ctx.message && "text" in ctx.message) {
      const userInput = ctx.message.text;
      const language = ctx.wizard.state.language || "не указан";

      if (ctx.from) {
        // Проверка на наличие ctx.from
        const userId = ctx.from.id; // ID телеграмм пользователя

        if (userInput) {
          try {
            const apiUrl = process.env.api_url; // URL API из .env
            const adminToken = process.env.admintoken; // Bearer токен из .env

            // Тело запроса
            const requestBody = {
              text: userInput,
              language: language === "russian" ? "russian" : "buryat",
              id: userId,
            };

            // Отправка POST-запроса
            const response = await fetch(`${apiUrl}/vocabulary/suggest-word`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
              },
              body: JSON.stringify(requestBody),
            });

            if (response.ok) {
              await ctx.reply(
                `Ваше предложение успешно отправлено: ${userInput}`
              );
            } else {
              await ctx.reply(
                `Ошибка при отправке предложения: ${response.statusText}`
              );
            }
          } catch (error) {
            console.error("Ошибка при запросе:", error);
            await ctx.reply(
              "Произошла ошибка при отправке вашего предложения."
            );
          }

          return ctx.scene.enter("dictionary-wizard"); // Переход на главную после обработки
        } else {
          return ctx.scene.enter("home");
        }
      } else {
        await ctx.reply("Не удалось определить пользователя.");
      }
    } else {
      await ctx.reply("Пожалуйста, введите текстовое сообщение.");
    }
  }
);

const dictionaryKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("Русский", "select_russian"),
    Markup.button.callback("Бурятский", "select_buryat"),
  ],
  [Markup.button.callback("Предложить слово", "suggest_word")],
  [Markup.button.callback("Назад", "home")],
]);

// Убираем `ctx.wizard.next()` из `enter`
dictionaryWizard.enter(async (ctx) => {
  sendOrEditMessage(
    ctx,
    "<b>Словарь</b> \n\nВыберите язык для перевода или предложите слово для дальнейшего перевода нашим сообществом",
    dictionaryKeyboard
  );
});

// Обработчики выбора языка
dictionaryWizard.action("select_russian", async (ctx) => {
  ctx.wizard.state.language = "russian";
  await sendOrEditMessage(ctx, "Введите слово для перевода с русского:");
  return ctx.wizard.selectStep(1); // Переход к шагу 1
});

// Обработчики выбора языка
dictionaryWizard.action("select_buryat", async (ctx) => {
  ctx.wizard.state.language = "buryat";
  await sendOrEditMessage(ctx, "Введите слово для перевода с бурятского:");
  return ctx.wizard.selectStep(1); // Переход к шагу 1
});

// Обработчик для предложения слова
dictionaryWizard.action("suggest_word", async (ctx) => {
  const languageSelectionKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("Русский", "suggest_russian"),
      Markup.button.callback("Бурятский", "suggest_buryat"),
    ],
    [Markup.button.callback("Назад", "back")],
  ]);

  await sendOrEditMessage(
    ctx,
    "Выберите язык, на котором хотите предложить слово для корпуса:",
    languageSelectionKeyboard
  );
});

// Обработчик для предложения слова на русском языке
dictionaryWizard.action("suggest_russian", async (ctx) => {
  ctx.wizard.state.language = "russian";
  await sendOrEditMessage(
    ctx,
    "Введите слово или фразу, которую хотите отправить на перевод с русского:"
  );
  return ctx.wizard.selectStep(2); // Переход к шагу 2
});

// Обработчик для предложения слова на бурятском языке
dictionaryWizard.action("suggest_buryat", async (ctx) => {
  ctx.wizard.state.language = "buryat";
  await sendOrEditMessage(
    ctx,
    "Введите слово или фразу, которую хотите отправить на перевод с бурятского:"
  );
  return ctx.wizard.selectStep(2); // Переход к шагу 2
});

dictionaryWizard.action("home", async (ctx) => {
  console.log(ctx.wizard.state.language);
  ctx.scene.enter("home");
});

dictionaryWizard.action("back", async (ctx) => {
    ctx.scene.enter("dictionary-wizard");
})

export default dictionaryWizard;
