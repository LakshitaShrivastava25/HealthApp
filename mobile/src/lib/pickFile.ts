import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import type { UploadFile } from './api';

/**
 * Choosing a medical document on a phone.
 *
 * This is the one place mobile genuinely beats the web app: the web
 * version can only open a file dialog, while here a prescription can be
 * photographed on the spot. All three sources normalise to the same
 * {uri, name, type} shape the upload helpers expect.
 */

const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];

function guessMimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  return 'image/jpeg';
}

/** A stable filename — several pickers hand back a bare cache path. */
function nameFor(uri: string, fallbackExt: string, given?: string | null) {
  if (given) return given;
  const tail = uri.split('/').pop();
  if (tail && tail.includes('.')) return tail;
  return `upload-${Date.now()}.${fallbackExt}`;
}

export async function pickFromCamera(): Promise<UploadFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Camera access needed',
      'Allow camera access to photograph a prescription or report.'
    );
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: nameFor(asset.uri, 'jpg', asset.fileName),
    type: asset.mimeType ?? 'image/jpeg',
  };
}

export async function pickFromLibrary(): Promise<UploadFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Photo access needed', 'Allow photo access to choose an existing image.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: nameFor(asset.uri, 'jpg', asset.fileName),
    type: asset.mimeType ?? 'image/jpeg',
  };
}

export async function pickDocument(): Promise<UploadFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ACCEPTED,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: nameFor(asset.uri, 'pdf', asset.name),
    type: asset.mimeType ?? guessMimeFromName(asset.name ?? ''),
  };
}
