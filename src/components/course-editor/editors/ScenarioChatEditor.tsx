import { ArrowDown, ArrowUp, CheckCircle2, MessageSquareText, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from './VideoEditor';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';

export interface ScenarioChatPerson {
  name: string;
  description: string;
}

export interface ScenarioChatChoice {
  id: string;
  text: string;
  correct: boolean;
  response_message: string;
  response_description: string;
  character_status: string;
  explanation: string;
}

export interface ScenarioChatRound {
  id: string;
  scenario_message: {
    text: string;
    description: string;
  };
  choices: ScenarioChatChoice[];
}

export interface ScenarioChatData {
  version: 1;
  context_description: string;
  participant: ScenarioChatPerson;
  learner: ScenarioChatPerson;
  rounds: ScenarioChatRound[];
}

interface ScenarioChatEditorProps {
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  data: ScenarioChatData;
  onDataChange: (value: ScenarioChatData) => void;
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function textValue(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw : fallback;
}

function defaultChoices(): ScenarioChatChoice[] {
  return [
    {
      id: makeId('choice'),
      text: 'Phản hồi phù hợp',
      correct: true,
      response_message: 'Cảm ơn bạn, cách phản hồi này phù hợp với tình huống.',
      response_description: 'Phản hồi của nhân vật',
      character_status: '',
      explanation: 'Đáp án này đúng vì thể hiện thái độ và nội dung phù hợp với mục tiêu giao tiếp.',
    },
    {
      id: makeId('choice'),
      text: 'Phản hồi chưa phù hợp 1',
      correct: false,
      response_message: 'Cách phản hồi này có thể khiến cuộc trao đổi đi sai hướng.',
      response_description: 'Phản hồi của nhân vật',
      character_status: '',
      explanation: 'Đáp án này chưa đúng. Hãy chọn cách phản hồi rõ ràng và phù hợp hơn.',
    },
    {
      id: makeId('choice'),
      text: 'Phản hồi chưa phù hợp 2',
      correct: false,
      response_message: 'Tôi chưa nhận được thông tin cần thiết từ câu trả lời này.',
      response_description: 'Phản hồi của nhân vật',
      character_status: '',
      explanation: 'Đáp án này chưa đúng vì chưa xử lý trọng tâm của tình huống.',
    },
  ];
}

export function createScenarioChatRound(index: number): ScenarioChatRound {
  return {
    id: makeId('round'),
    scenario_message: {
      text: index === 0
        ? 'Chào bạn, tôi cần trao đổi với bạn về tình huống này.'
        : 'Tình huống tiếp theo diễn ra như sau.',
      description: 'Hãy chọn phản hồi phù hợp nhất.',
    },
    choices: defaultChoices(),
  };
}

function normalizeChoice(raw: any, index: number): ScenarioChatChoice {
  const defaults = defaultChoices();
  const fallback = defaults[index] || defaults[0];
  return {
    id: textValue(raw?.id, fallback.id) || fallback.id,
    text: textValue(raw?.text, fallback.text),
    correct: raw?.correct === true,
    response_message: textValue(raw?.response_message, fallback.response_message),
    response_description: textValue(raw?.response_description, fallback.response_description),
    character_status: textValue(raw?.character_status, ''),
    explanation: textValue(raw?.explanation, fallback.explanation),
  };
}

function ensureThreeChoices(rawChoices: any[]): ScenarioChatChoice[] {
  const defaults = defaultChoices();
  const base = Array.isArray(rawChoices) ? rawChoices.slice(0, 3) : [];
  while (base.length < 3) base.push(defaults[base.length]);

  const normalized = base.map((choice, index) => normalizeChoice(choice, index));
  const firstCorrect = normalized.findIndex(choice => choice.correct);
  const safeCorrectIndex = firstCorrect >= 0 ? firstCorrect : 0;
  return normalized.map((choice, index) => ({ ...choice, correct: index === safeCorrectIndex }));
}

function scenarioContextDescription(parsed: any): string {
  if (typeof parsed?.context_description === 'string') return parsed.context_description;
  if (typeof parsed?.status_line === 'string') return parsed.status_line;
  if (!Array.isArray(parsed?.rounds)) return 'Tình huống bắt đầu';

  const legacyRoundContext = parsed.rounds
    .map((round: any) => textValue(round?.status_line).trim())
    .find((value: string) => value.length > 0);

  return legacyRoundContext || 'Tình huống bắt đầu';
}

export function normalizeScenarioChatData(raw: any): ScenarioChatData {
  const parsed = typeof raw === 'string'
    ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
    : raw;
  const rounds = Array.isArray(parsed?.rounds)
    ? parsed.rounds.map((round: any, index: number): ScenarioChatRound => ({
      id: textValue(round?.id, `round_${index + 1}`) || `round_${index + 1}`,
      scenario_message: {
        text: textValue(round?.scenario_message?.text, ''),
        description: textValue(round?.scenario_message?.description, ''),
      },
      choices: ensureThreeChoices(round?.choices),
    }))
    : [];

  return {
    version: 1,
    context_description: scenarioContextDescription(parsed),
    participant: {
      name: textValue(parsed?.participant?.name, 'Nhân vật tình huống') || 'Nhân vật tình huống',
      description: textValue(parsed?.participant?.description, 'Người đối thoại trong kịch bản'),
    },
    learner: {
      name: textValue(parsed?.learner?.name, 'Bạn') || 'Bạn',
      description: textValue(parsed?.learner?.description, 'Học viên'),
    },
    rounds: rounds.length > 0 ? rounds : [createScenarioChatRound(0)],
  };
}

export function getScenarioChatValidationError(data: ScenarioChatData): string | null {
  if (!data.participant.name.trim()) return i18n.t('courseEditorForms.scenarioParticipantNameRequired');
  if (!data.learner.name.trim()) return i18n.t('courseEditorForms.scenarioLearnerNameRequired');
  if (!data.rounds.length) return i18n.t('courseEditorForms.scenarioRoundRequired');

  for (let index = 0; index < data.rounds.length; index += 1) {
    const round = data.rounds[index];
    if (!round.scenario_message.text.trim()) return i18n.t('courseEditorForms.scenarioBubbleRequired', { round: index + 1 });
    if (round.choices.length !== 3) return i18n.t('courseEditorForms.scenarioExactlyThreeResponses', { round: index + 1 });
    if (round.choices.filter(choice => choice.correct).length !== 1) return i18n.t('courseEditorForms.scenarioExactlyOneCorrectResponse', { round: index + 1 });
    for (let choiceIndex = 0; choiceIndex < round.choices.length; choiceIndex += 1) {
      const choice = round.choices[choiceIndex];
      if (!choice.text.trim()) return i18n.t('courseEditorForms.scenarioResponseContentRequired', { round: index + 1, response: choiceIndex + 1 });
      if (!choice.response_message.trim()) return i18n.t('courseEditorForms.scenarioResponseBubbleRequired', { round: index + 1, response: choiceIndex + 1 });
      if (!choice.explanation.trim()) return i18n.t('courseEditorForms.scenarioResponseExplanationRequired', { round: index + 1, response: choiceIndex + 1 });
    }
  }

  return null;
}

export default function ScenarioChatEditor({
  displayName,
  onDisplayNameChange,
  data,
  onDataChange,
}: ScenarioChatEditorProps) {
  const { t } = useTranslation();
  const scenario = normalizeScenarioChatData(data);
  const validationError = getScenarioChatValidationError(scenario);

  const updateScenario = (updater: (current: ScenarioChatData) => ScenarioChatData) => {
    onDataChange(normalizeScenarioChatData(updater(scenario)));
  };

  const updateRound = (roundId: string, updater: (round: ScenarioChatRound) => ScenarioChatRound) => {
    updateScenario(current => ({
      ...current,
      rounds: current.rounds.map(round => round.id === roundId ? updater(round) : round),
    }));
  };

  const updateChoice = (roundId: string, choiceId: string, updater: (choice: ScenarioChatChoice) => ScenarioChatChoice) => {
    updateRound(roundId, round => ({
      ...round,
      choices: ensureThreeChoices(round.choices.map(choice => choice.id === choiceId ? updater(choice) : choice)),
    }));
  };

  const setCorrectChoice = (roundId: string, choiceId: string) => {
    updateRound(roundId, round => ({
      ...round,
      choices: round.choices.map(choice => ({ ...choice, correct: choice.id === choiceId })),
    }));
  };

  const addRound = () => {
    updateScenario(current => ({
      ...current,
      rounds: [...current.rounds, createScenarioChatRound(current.rounds.length)],
    }));
  };

  const removeRound = (roundId: string) => {
    updateScenario(current => ({
      ...current,
      rounds: current.rounds.length > 1 ? current.rounds.filter(round => round.id !== roundId) : current.rounds,
    }));
  };

  const moveRound = (roundIndex: number, direction: -1 | 1) => {
    updateScenario(current => {
      const nextIndex = roundIndex + direction;
      if (nextIndex < 0 || nextIndex >= current.rounds.length) return current;
      const rounds = [...current.rounds];
      const [item] = rounds.splice(roundIndex, 1);
      rounds.splice(nextIndex, 0, item);
      return { ...current, rounds };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-primary font-bold">
            <MessageSquareText className="h-5 w-5" />
            <span>{t('courseEditorForms.scenarioChatTitle')}</span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('courseEditorForms.scenarioChatDescription')}
          </p>
        </div>
        <div className="w-full lg:w-[360px]">
          <Field label={t('courseUnit.displayName')}>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={displayName}
              onChange={event => onDisplayNameChange(event.target.value)}
            />
          </Field>
        </div>
      </div>

      {validationError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {validationError}
        </div>
      )}

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
          <div className="text-sm font-bold">{t('courseEditorForms.scenarioParticipantLeft')}</div>
          <Field label={t('courseEditorForms.scenarioChatName')}>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={scenario.participant.name}
              onChange={event => updateScenario(current => ({
                ...current,
                participant: { ...current.participant, name: event.target.value },
              }))}
            />
          </Field>
          <Field label={t('courseEditorForms.scenarioBubbleDescription')}>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={scenario.participant.description}
              onChange={event => updateScenario(current => ({
                ...current,
                participant: { ...current.participant, description: event.target.value },
              }))}
            />
          </Field>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
          <div className="text-sm font-bold">{t('courseEditorForms.scenarioLearnerRight')}</div>
          <Field label={t('courseEditorForms.scenarioChatName')}>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={scenario.learner.name}
              onChange={event => updateScenario(current => ({
                ...current,
                learner: { ...current.learner, name: event.target.value },
              }))}
            />
          </Field>
          <Field label={t('courseEditorForms.scenarioBubbleDescription')}>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={scenario.learner.description}
              onChange={event => updateScenario(current => ({
                ...current,
                learner: { ...current.learner, description: event.target.value },
              }))}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
        <Field label={t('courseEditorForms.scenarioContextDescription')}>
          <textarea
            className="min-h-[84px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
            value={scenario.context_description}
            onChange={event => updateScenario(current => ({ ...current, context_description: event.target.value }))}
          />
        </Field>
      </div>

      <div className="space-y-4">
        {scenario.rounds.map((round, roundIndex) => (
          <div key={round.id} className="rounded-lg border border-border bg-card p-3 shadow-sm space-y-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold">{t('courseEditorForms.scenarioConversationRound', { count: roundIndex + 1 })}</div>
                <div className="text-xs text-muted-foreground">{t('courseEditorForms.scenarioTypingDelay')}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveRound(roundIndex, -1)} disabled={roundIndex === 0}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveRound(roundIndex, 1)} disabled={roundIndex >= scenario.rounds.length - 1}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => removeRound(round.id)} disabled={scenario.rounds.length <= 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Field label={t('courseEditorForms.scenarioBubble')}>
                <textarea
                  className="min-h-[72px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
                  value={round.scenario_message.text}
                  onChange={event => updateRound(round.id, current => ({
                    ...current,
                    scenario_message: { ...current.scenario_message, text: event.target.value },
                  }))}
                />
              </Field>
              <Field label={t('courseEditorForms.scenarioBubbleDescription')}>
                <input
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={round.scenario_message.description}
                  onChange={event => updateRound(round.id, current => ({
                    ...current,
                    scenario_message: { ...current.scenario_message, description: event.target.value },
                  }))}
                />
              </Field>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold">{t('courseEditorForms.scenarioLearnerResponses')}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('courseEditorForms.scenarioFixedThreeResponses')}</p>
                </div>
              </div>

              <div className="grid gap-3 2xl:grid-cols-3">
                {round.choices.map((choice, choiceIndex) => (
                  <div key={choice.id} className="min-w-0 rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="radio"
                        name={`correct-${round.id}`}
                        checked={choice.correct}
                        onChange={() => setCorrectChoice(round.id, choice.id)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span>{t('courseEditorForms.scenarioResponse', { count: choiceIndex + 1 })}</span>
                      {choice.correct && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    </label>
                    <Field label={t('courseEditorForms.scenarioLearnerChoiceContent')}>
                      <textarea
                        className="min-h-[64px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
                        value={choice.text}
                        onChange={event => updateChoice(round.id, choice.id, current => ({ ...current, text: event.target.value }))}
                      />
                    </Field>
                    <Field label={t('courseEditorForms.scenarioResponseBubble')}>
                      <textarea
                        className="min-h-[64px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
                        value={choice.response_message}
                        onChange={event => updateChoice(round.id, choice.id, current => ({ ...current, response_message: event.target.value }))}
                      />
                    </Field>
                    <Field label={t('courseEditorForms.scenarioResponseBubbleDescription')}>
                      <input
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={choice.response_description}
                        onChange={event => updateChoice(round.id, choice.id, current => ({ ...current, response_description: event.target.value }))}
                      />
                    </Field>
                    <Field label={t('courseEditorForms.scenarioCharacterStatusOptional')}>
                      <input
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={choice.character_status}
                        placeholder={t('courseEditorForms.scenarioCharacterStatusPlaceholder')}
                        onChange={event => updateChoice(round.id, choice.id, current => ({ ...current, character_status: event.target.value }))}
                      />
                    </Field>
                    <Field label={t('courseEditorForms.scenarioChatExplanation')}>
                      <textarea
                        className="min-h-[72px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
                        value={choice.explanation}
                        onChange={event => updateChoice(round.id, choice.id, current => ({ ...current, explanation: event.target.value }))}
                      />
                    </Field>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" className="w-full border-dashed gap-2" onClick={addRound}>
        <Plus className="h-4 w-4" />
        {t('courseEditorForms.scenarioAddConversationRound')}
      </Button>
    </div>
  );
}
