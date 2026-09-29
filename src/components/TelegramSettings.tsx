import { useEffect, useState } from "preact/hooks";
import { QRCodeCanvas } from "qrcode.react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  MessageCircle,
  Clock,
  RotateCcw,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Send,
} from "lucide-react";

interface TelegramSettingsProps {
  sendTelegrams: boolean;
  setSendTelegrams: (value: boolean) => void;
  telegramBotToken: string;
  setTelegramBotToken: (value: string) => void;
  telegramChatId: number;
  debounceTime: number;
  setDebounceTime: (value: number) => void;
  botUsername: string;
  tokenError: string;
  isValidatingToken: boolean;
  sendTestMessage: () => Promise<boolean>;
  resetTelegramSettings: () => void;
}

type WizardProps = Pick<
  TelegramSettingsProps,
  | "sendTelegrams"
  | "setSendTelegrams"
  | "telegramBotToken"
  | "setTelegramBotToken"
  | "telegramChatId"
  | "botUsername"
  | "tokenError"
  | "isValidatingToken"
  | "sendTestMessage"
> & {
  onDisconnect: () => void;
};

export function TelegramSettings({
  sendTelegrams,
  setSendTelegrams,
  telegramBotToken,
  setTelegramBotToken,
  telegramChatId,
  botUsername,
  tokenError,
  isValidatingToken,
  sendTestMessage,
  onDisconnect,
}: WizardProps) {
  const [showToken, setShowToken] = useState(false);
  const [draftToken, setDraftToken] = useState(telegramBotToken);
  const [testState, setTestState] = useState<"idle" | "sending" | "success" | "error">("idle");

  useEffect(() => {
    setDraftToken(telegramBotToken);
  }, [telegramBotToken]);

  const isTokenValid = !!botUsername && !tokenError;
  const isConnected = !!botUsername && !!telegramChatId;

  const botLink = botUsername ? `https://t.me/${botUsername}` : "";
  const draftDirty = draftToken.trim() !== telegramBotToken.trim();
  const canConnect = draftToken.trim().length > 0 && !isValidatingToken;

  const handleConnect = () => {
    const t = draftToken.trim();
    if (t && t !== telegramBotToken) setTelegramBotToken(t);
  };

  const handleTest = async () => {
    setTestState("sending");
    const ok = await sendTestMessage();
    setTestState(ok ? "success" : "error");
    setTimeout(() => setTestState("idle"), 4000);
  };

  return (
    <section aria-labelledby="notif-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 id="notif-heading" className="text-base font-semibold flex items-center gap-2">
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
          Telegram alerts
        </h3>
        <span
          className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
            isConnected
              ? "bg-green-700/10 text-green-800 dark:text-green-300"
              : "bg-secondary text-secondary-foreground"
          }`}
          role="status"
        >
          {isConnected ? "On" : "Off"}
        </span>
      </div>

      {!isConnected ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Get a Telegram message with a snapshot when motion is detected.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="bot-token">1. Paste your bot token</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="bot-token"
                  type={(showToken ? "text" : "password") as any}
                  placeholder="Paste token from @BotFather"
                  value={draftToken}
                  onInput={(e) => setDraftToken((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if ((e as KeyboardEvent).key === "Enter") handleConnect();
                  }}
                  autoComplete="off"
                  aria-invalid={!!tokenError}
                  aria-describedby="bot-token-feedback bot-token-help"
                  className="font-mono pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  aria-label={showToken ? "Hide token" : "Show token"}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showToken ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
              <Button
                type="button"
                className="min-h-[44px] shrink-0 cursor-pointer"
                disabled={!canConnect}
                onClick={handleConnect}
              >
                {isValidatingToken ? (
                  <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : null}
                Connect
              </Button>
            </div>
            <p id="bot-token-help" className="text-sm text-muted-foreground">
              Create one with{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                @BotFather
              </a>{" "}
              → <code className="bg-muted px-1 rounded">/newbot</code>
            </p>
            <div id="bot-token-feedback" aria-live="polite" className="text-sm min-h-[1.25rem]">
              {isValidatingToken && (
                <span className="text-muted-foreground inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  Checking token…
                </span>
              )}
              {!isValidatingToken && tokenError && (telegramBotToken || draftDirty === false) && (
                <span role="alert" className="text-destructive">
                  {tokenError}
                </span>
              )}
              {!isValidatingToken && !tokenError && isTokenValid && (
                <span className="text-green-700 dark:text-green-400 inline-flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  Found @{botUsername}
                </span>
              )}
            </div>
          </div>

          {isTokenValid && (
            <div className="rounded-lg bg-muted/70 px-4 py-3 space-y-3">
              <p className="text-sm font-medium">2. Open your bot and press Start</p>
              <div className="flex items-center gap-4">
                <div className="bg-white rounded-md p-1.5 shrink-0" role="img" aria-label={`QR code for @${botUsername}`}>
                  <QRCodeCanvas value={botLink} size={96} />
                </div>
                <div className="space-y-2 min-w-0">
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-[44px] cursor-pointer"
                    onClick={() => window.open(botLink, "_blank", "noopener,noreferrer")}
                  >
                    <Send className="w-4 h-4" aria-hidden="true" />
                    Open @{botUsername}
                  </Button>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5" role="status" aria-live="polite">
                    <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Waiting for you to press Start…
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-green-700 dark:text-green-400 shrink-0" aria-hidden="true" />
            <span>
              Sending alerts to <strong>@{botUsername}</strong>
            </span>
            <button
              type="button"
              onClick={onDisconnect}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 min-h-[44px] px-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Disconnect
            </button>
          </div>

          <div className="flex items-center space-x-2 min-h-[44px]">
            <Switch
              id="send-telegrams"
              checked={sendTelegrams}
              onCheckedChange={setSendTelegrams}
              className="cursor-pointer"
            />
            <Label htmlFor="send-telegrams" className="cursor-pointer">
              Motion alerts
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto min-h-[44px] cursor-pointer"
              disabled={testState === "sending"}
              onClick={handleTest}
            >
              {testState === "sending" ? (
                <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
              {testState === "sending" ? "Sending…" : "Send test"}
            </Button>
          </div>
          <div aria-live="polite" className="text-sm min-h-[1rem]">
            {testState === "success" && (
              <span className="text-green-700 dark:text-green-400">Check Telegram — message delivered.</span>
            )}
            {testState === "error" && (
              <span role="alert" className="text-destructive">Delivery failed. Try again.</span>
            )}
            {testState === "idle" && (
              <span className="text-muted-foreground">
                Send <code className="bg-muted px-1 rounded">/status</code> to your bot for snapshots.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function TelegramAdvancedSettings({
  debounceTime,
  setDebounceTime,
  resetTelegramSettings,
}: Pick<TelegramSettingsProps, "debounceTime" | "setDebounceTime" | "resetTelegramSettings">) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="debounce-time" className="flex items-center gap-2">
          <Clock className="w-4 h-4" aria-hidden="true" />
          Debounce Time (ms)
        </Label>
        <Input
          id="debounce-time"
          type="number"
          value={debounceTime}
          onInput={(e) => {
            const raw = parseInt((e.target as HTMLInputElement).value, 10);
            if (Number.isNaN(raw)) return;
            setDebounceTime(Math.min(60000, Math.max(1000, raw)));
          }}
          min={1000}
          max={60000}
          step={500}
        />
        <p className="text-sm text-muted-foreground">Minimum time between motion alerts.</p>
      </div>
      <Button onClick={resetTelegramSettings} variant="outline" className="w-full min-h-[44px] cursor-pointer transition-colors duration-200">
        <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
        Reset Telegram Settings
      </Button>
    </div>
  );
}
