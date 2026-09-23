import crypto from 'crypto';
import { PlanStep, AgentEvent } from '../types/events';

export class Planner {
  private steps: PlanStep[] = [];
  private replanCount = 0;
  private readonly MAX_REPLANS = 3;

  constructor(private emitEvent: (event: AgentEvent) => void) {}

  /**
   * Détermine si une demande est non triviale et justifie l'ouverture d'un plan.
   * Une demande triviale (salutation, question théorique simple) n'ouvre aucun plan.
   */
  public isNonTrivial(prompt: string): boolean {
    const trimmed = prompt.trim().toLowerCase();
    if (!trimmed) return false;

    // Salutations et courtoisies pures
    const greetings = ['bonjour', 'salut', 'coucou', 'hello', 'hi', 'bonsoir', 'merci', 'qui es-tu', 'qui es tu', 'aide'];
    if (greetings.some(g => trimmed === g || trimmed === `${g} !` || trimmed === `${g} ?` || trimmed === `${g}.`)) {
      return false;
    }

    // Questions purement informatives sans action demandée sur le code
    if (/^(c'est quoi|qu'est-ce que|qu'est ce que|quelle est la diff|pourquoi|explique|comment fonctionne)\b/i.test(trimmed) &&
        !/code|fichier|projet|corrige|modifie|ajoute|crée|test|build/i.test(trimmed)) {
      return false;
    }

    // Mots-clés déclencheurs d'actions d'ingénierie
    const actionKeywords = [
      'crée', 'creer', 'créer', 'ajoute', 'ajouter', 'modifie', 'modifier',
      'corrige', 'corriger', 'fix', 'refactor', 'refactorise', 'supprime',
      'teste', 'tester', 'test', 'compile', 'compiler', 'build', 'vérifie',
      'verifier', 'vérifier', 'implémente', 'implemente', 'implémenter',
      'installe', 'installer', 'commit', 'branche', 'git', 'inspecte', 'analyse'
    ];

    if (actionKeywords.some(kw => trimmed.includes(kw))) {
      return true;
    }

    // Longueur et structure : requête détaillée de plus de 60 caractères
    return trimmed.length > 60;
  }

  /**
   * Crée le plan initial adapté à la demande.
   */
  public createInitialPlan(prompt: string): PlanStep[] {
    if (!this.isNonTrivial(prompt)) {
      this.steps = [];
      this.replanCount = 0;
      this.notify();
      return [];
    }

    this.replanCount = 0;
    this.steps = [
      {
        id: crypto.randomUUID(),
        title: 'Analyser la demande et inspecter l\'environnement',
        status: 'in_progress',
        description: 'Examen des fichiers, configuration et dépendances.'
      },
      {
        id: crypto.randomUUID(),
        title: 'Appliquer les modifications ciblées',
        status: 'pending',
        description: 'Édition rigoureuse sans altération visuelle ni régression.'
      },
      {
        id: crypto.randomUUID(),
        title: 'Vérifier la conformité et valider le projet',
        status: 'pending',
        description: 'Contrôles statiques (types, lint, tests, build) et inspection du diff.'
      }
    ];

    this.notify();
    return this.steps;
  }

  public setPlan(stepTitles: string[]): PlanStep[] {
    this.replanCount = 0;
    this.steps = stepTitles.map((title, idx) => ({
      id: crypto.randomUUID(),
      title,
      status: (idx === 0 ? 'in_progress' : 'pending') as PlanStep['status']
    }));

    this.notify();
    return this.steps;
  }

  public updateStepStatus(
    stepIndex: number,
    status: 'pending' | 'in_progress' | 'completed' | 'failed',
    details?: string
  ): void {
    if (this.steps[stepIndex]) {
      this.steps[stepIndex].status = status;
      if (details) {
        this.steps[stepIndex].details = details;
      }
      this.notify();
    }
  }

  public markNextInProgress(): void {
    const nextPending = this.steps.find(s => s.status === 'pending');
    if (nextPending) {
      nextPending.status = 'in_progress';
      this.notify();
    }
  }

  /**
   * Auto-replanification après un échec (vérification ou outil) (§5.2, §22).
   * Insère une étape de diagnostic et une étape de correction ciblée.
   */
  public replanAfterFailure(failure: {
    checkName?: string;
    output?: string;
    tool?: string;
    error?: string;
  }): { replanned: boolean; steps: PlanStep[]; maxReached?: boolean } {
    if (this.replanCount >= this.MAX_REPLANS) {
      return { replanned: false, steps: this.steps, maxReached: true };
    }

    this.replanCount++;
    const failureLabel = failure.checkName || failure.tool || 'Contrôle';
    const failureMsg = failure.output || failure.error || 'Erreur détectée';

    // Trouver l'étape actuellement in_progress ou la dernière non complétée
    const currentIdx = this.steps.findIndex(s => s.status === 'in_progress');
    if (currentIdx !== -1) {
      this.steps[currentIdx].status = 'failed';
      this.steps[currentIdx].details = failureMsg;
    }

    const diagStep: PlanStep = {
      id: crypto.randomUUID(),
      title: `Diagnostiquer l'erreur (${failureLabel})`,
      status: 'in_progress',
      details: failureMsg,
      description: `Analyse ciblée du problème : ${failureLabel}`
    };

    const fixStep: PlanStep = {
      id: crypto.randomUUID(),
      title: 'Appliquer la correction ciblée',
      status: 'pending',
      description: 'Remédiation sans régression ni modification d\'interface.'
    };

    const recheckStep: PlanStep = {
      id: crypto.randomUUID(),
      title: 'Relancer la vérification',
      status: 'pending',
      description: 'Validation de l\'intégrité après correction.'
    };

    // Insérer les étapes correctives
    if (currentIdx !== -1) {
      this.steps.splice(currentIdx + 1, 0, diagStep, fixStep, recheckStep);
    } else {
      this.steps.push(diagStep, fixStep, recheckStep);
    }

    this.notify();
    return { replanned: true, steps: this.steps };
  }

  public getReplanCount(): number {
    return this.replanCount;
  }

  public resetReplanCount(): void {
    this.replanCount = 0;
  }

  public loadFromCheckpoint(steps: PlanStep[]): void {
    this.steps = [...steps];
    this.notify();
  }

  public getSteps(): PlanStep[] {
    return this.steps;
  }

  public getCurrentStepIndex(): number {
    const idx = this.steps.findIndex(s => s.status === 'in_progress');
    return idx !== -1 ? idx : this.steps.findIndex(s => s.status === 'pending');
  }

  public getPlanSummary(): string {
    if (this.steps.length === 0) return '';
    return this.steps.map((s, idx) => `${idx + 1}. [${s.status}] ${s.title}${s.details ? ` (${s.details})` : ''}`).join('\n');
  }

  public clear(): void {
    this.steps = [];
    this.replanCount = 0;
    this.notify();
  }

  private notify(): void {
    this.emitEvent({
      type: 'plan',
      steps: [...this.steps]
    });
  }
}
