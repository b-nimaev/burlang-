import { Composer, Scenes, Markup } from "telegraf";
import { MyContext } from "../types/MyContext";
import { sendOrEditMessage } from "..";

// Описываем тип для состояния Wizard-сцены
interface WizardState {
  language?: string;
  suggestion?: boolean;
  selectedWordId?: string; // Добавляем свойство для хранения _id выбранного слова
  selectedDialect?: string;
  normalized_text?: string;
}

// Массив бурятских диалектов
// const dialects = [
//   { value: "khori", label: "Хоринский" },
//   { value: "bulagat", label: "Булагатский" },
//   { value: "sartul", label: "Сартульский" },
//   { value: "unknown", label: "Не знаю" },
// ];

// Функция для отправки POST-запроса
// async function postRequest(url: string, body: object, token: string) {
//   return fetch(url, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: `Bearer ${token}`,
//     },
//     body: JSON.stringify(body),
//   });
// }

// Сцена "Личный кабинет"
const dashboardWizard = new Scenes.WizardScene<
  MyContext & { wizard: { state: WizardState } }
>(
  "dashboard-wizard",
  new Composer<MyContext>(),

  // Шаг 1: Получение текста от пользователя и его перевод
  async (ctx): Promise<void> => {
    if (ctx.message && "text" in ctx.message) {
      const userInput = ctx.message.text;
      const language = ctx.wizard.state.language;

      if (language) {
        await ctx.reply(
          `Перевод для "${userInput}" с ${language}: ${userInput}`
        );
      } else {
        await ctx.reply("Пожалуйста, выберите язык для перевода.");
      }

      ctx.scene.enter("dictionary-wizard"); // Возврат к сцене после обработки
      return 
    } else {
      await ctx.reply("Пожалуйста, введите текст.");
      return
    }
  }
);

const greetingMessage = `<b>Личный кабинет</b>`
const dashboardKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Информация о проекте", "about")],
  // [Markup.button.callback("Мои данные", "home")],
  [Markup.button.callback("Справочные материалы", "home")],
  [Markup.button.callback("💰 Зарабатывайте с нами", "home")],
  [
    Markup.button.callback("Главная", "home"),
    Markup.button.url("Обратная связь", "https://t.me/frntdev"), // Ссылка на обратную связь
  ],
]);

dashboardWizard.action(`about`, async (ctx: MyContext) => {
  try {

    ctx.answerCbQuery()

  } catch (error) {
    console.log(error)
  }
})

// Убираем `ctx.wizard.next()` из `enter`
dashboardWizard.enter(async (ctx) => {
  sendOrEditMessage(ctx, `${greetingMessage}`, dashboardKeyboard);
});

dashboardWizard.action("home", async (ctx) => {
  console.log(ctx.wizard.state.language);
  ctx.scene.enter("home");
});

export default dashboardWizard;
