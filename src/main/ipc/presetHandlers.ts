import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './channels';
import { DataStore } from '../services/DataStore';
import type { CreatePresetInput, UpdatePresetInput } from '@shared/types/presets';

/**
 * Register IPC handlers for Instance Preset operations
 */
export function registerPresetHandlers(): void {
  const dataStore = DataStore.getInstance();

  // Create a new preset
  ipcMain.handle(IPC_CHANNELS.PRESET_CREATE, (_event, data: CreatePresetInput) => {
    return dataStore.createPreset(data);
  });

  // Update an existing preset
  ipcMain.handle(IPC_CHANNELS.PRESET_UPDATE, (_event, id: string, updates: UpdatePresetInput) => {
    return dataStore.updatePreset(id, updates);
  });

  // Delete a preset
  ipcMain.handle(IPC_CHANNELS.PRESET_DELETE, (_event, id: string) => {
    dataStore.deletePreset(id);
    return { success: true };
  });

  // Get preset by ID
  ipcMain.handle(IPC_CHANNELS.PRESET_GET_BY_ID, (_event, id: string) => {
    return dataStore.getPresetById(id);
  });

  // Get presets for a project (includes global presets)
  ipcMain.handle(IPC_CHANNELS.PRESET_GET_BY_PROJECT, (_event, projectId: string) => {
    return dataStore.getPresetsByProject(projectId);
  });

  // Get all global presets
  ipcMain.handle(IPC_CHANNELS.PRESET_GET_GLOBAL, () => {
    return dataStore.getGlobalPresets();
  });

  // Get all presets
  ipcMain.handle(IPC_CHANNELS.PRESET_GET_ALL, () => {
    return dataStore.getAllPresets();
  });

  // Duplicate a preset
  ipcMain.handle(IPC_CHANNELS.PRESET_DUPLICATE, (_event, id: string, newName: string) => {
    return dataStore.duplicatePreset(id, newName);
  });
}

/**
 * Cleanup preset handlers
 */
export function cleanupPresetHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.PRESET_CREATE);
  ipcMain.removeHandler(IPC_CHANNELS.PRESET_UPDATE);
  ipcMain.removeHandler(IPC_CHANNELS.PRESET_DELETE);
  ipcMain.removeHandler(IPC_CHANNELS.PRESET_GET_BY_ID);
  ipcMain.removeHandler(IPC_CHANNELS.PRESET_GET_BY_PROJECT);
  ipcMain.removeHandler(IPC_CHANNELS.PRESET_GET_GLOBAL);
  ipcMain.removeHandler(IPC_CHANNELS.PRESET_GET_ALL);
  ipcMain.removeHandler(IPC_CHANNELS.PRESET_DUPLICATE);
}
