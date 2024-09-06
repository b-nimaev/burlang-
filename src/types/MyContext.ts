import { Context, Scenes } from "telegraf";

// Интерфейс сессии для Wizard-сцены
interface MyWizardSession extends Scenes.WizardSessionData {
  cursor: number; // Обязательное поле для wizard-сцен
  page?: number; // Дополнительное поле для хранения текущей страницы
  // Добавьте любые другие поля, которые могут быть нужны для сессии
}

// Интерфейс контекста
export interface MyContext extends Context {
  scene: Scenes.SceneContextScene<MyContext, MyWizardSession>;
  wizard: Scenes.WizardContextWizard<MyContext>;
  session: MyWizardSession & Scenes.WizardSession<MyWizardSession>; // Поддержка кастомной wizard-сессии
}
