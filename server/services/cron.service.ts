import cron from 'node-cron';

export class CronService {
  private tasks: cron.ScheduledTask[] = [];

  constructor() {
    this.initTasks();
  }

  private initTasks(): void {
    // Exemplo de tarefa: Executa a cada minuto
    const task = cron.schedule('* * * * *', () => {
      console.log('⏰ Executando tarefa agendada a cada minuto:', new Date().toLocaleString());
      // Adicione aqui a lógica da tarefa, por ex:
      // - Verificar status de campanhas
      // - Enviar relatórios por email
      // - Limpar dados antigos
    });

    this.tasks.push(task);
  }

  public startTasks(): void {
    console.log('▶️ Iniciando tarefas agendadas...');
    this.tasks.forEach(task => task.start());
  }

  public stopTasks(): void {
    console.log('⏹️ Parando tarefas agendadas...');
    this.tasks.forEach(task => task.stop());
  }
}
