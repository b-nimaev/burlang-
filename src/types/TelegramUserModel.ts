export default interface TelegramUser {
    _id: string;
    id: number;
    username?: string;
    rating: number;
    referrals_telegram?: string[];
    createdAt: Date;
    updatedAt: Date;
    email: string;
    c_username: string;
    theme: "light" | "dark";
    vocabular: {
        selected_language_for_translate: 'russian' | 'buryat'
    }
}
