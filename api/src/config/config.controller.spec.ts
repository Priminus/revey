import { ConfigController } from './config.controller';

describe('ConfigController settings', () => {
  const templates = {};
  const flow = {};
  const settings = {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
  };
  const controller = new ConfigController(templates as never, flow as never, settings as never);

  afterEach(() => jest.clearAllMocks());

  it('GET /config/settings returns the client autoSend value', async () => {
    settings.getSettings.mockResolvedValue({ autoSend: true });
    const result = await controller.getSettings('c1');
    expect(settings.getSettings).toHaveBeenCalledWith('c1');
    expect(result).toEqual({ autoSend: true });
  });

  it('PATCH /config/settings delegates to SettingsService.updateSettings', async () => {
    settings.updateSettings.mockResolvedValue({ autoSend: true });
    const result = await controller.updateSettings('c1', { autoSend: true });
    expect(settings.updateSettings).toHaveBeenCalledWith('c1', { autoSend: true });
    expect(result).toEqual({ autoSend: true });
  });
});
