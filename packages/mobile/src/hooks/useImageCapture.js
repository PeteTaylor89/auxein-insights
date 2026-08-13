// hooks/useImageCapture.js — camera/gallery picker with durable upload.
//
// Photos are copied out of the OS cache the moment they're picked, then handed
// to the write queue rather than uploaded inline. uploadAll() used to loop the
// files and swallow each failure with a console.log, so a photo taken in a dead
// spot vanished and the screen still reported success. Queuing makes the upload
// survive a restart and retry on the sync coordinator's backoff.
import { useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { persistPendingPhoto, deletePendingPhoto } from '../services/photoStore';
import { queuePhotoUpload } from '../services/uploadQueue';
import { triggerSync } from '../services/syncCoordinator';

export default function useImageCapture(entityType, entityId) {
  const [images, setImages] = useState([]);      // durable local URIs for preview
  const [uploading, setUploading] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

  const requestPermission = async (type) => {
    if (type === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to take photos.');
        return false;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed to select photos.');
        return false;
      }
    }
    return true;
  };

  // Copy into the document directory before anything else touches it.
  const adopt = (uris) => {
    const kept = uris.map(persistPendingPhoto).filter(Boolean);
    if (kept.length) setImages(prev => [...prev, ...kept]);
  };

  const takePhoto = async () => {
    if (!(await requestPermission('camera'))) return;
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        // Field photos are evidence, not artwork. 0.5 roughly halves the bytes
        // against 0.7 with no meaningful loss at the size these are viewed, and
        // on a weak rural connection the upload either finishes or it doesn't.
        quality: 0.5,
        exif: false,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets?.[0]) adopt([result.assets[0].uri]);
    } catch (err) {
      console.warn('[ImageCapture] Camera failed:', err?.message);
      Alert.alert('Camera', 'Could not take that photo. Try again.');
    }
  };

  const pickFromGallery = async () => {
    if (!(await requestPermission('library'))) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.5,
        exif: false,
        allowsMultipleSelection: true,
        selectionLimit: 5,
      });
      if (!result.canceled && result.assets?.length > 0) {
        adopt(result.assets.map(a => a.uri));
      }
    } catch (err) {
      console.warn('[ImageCapture] Gallery failed:', err?.message);
      Alert.alert('Photos', 'Could not add those photos. Try again.');
    }
  };

  // Removing before upload also removes the durable copy — otherwise every
  // discarded photo would sit in the document directory forever.
  const removeImage = (index) => {
    setImages(prev => {
      const victim = prev[index];
      if (victim) deletePendingPhoto(victim);
      return prev.filter((_, i) => i !== index);
    });
  };

  const showPicker = () => {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Camera', onPress: takePhoto },
      { text: 'Gallery', onPress: pickFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Hand every captured photo to the queue. `target` may be an id, or the
  // record returned by a create — including a queued 202 stub, in which case
  // the upload waits for its parent to sync and picks up the real id.
  //
  // Returns the queued entry ids. It no longer returns server file records:
  // offline there aren't any yet, and pretending otherwise is what made this
  // look like it worked when it hadn't.
  const uploadAll = async (target) => {
    const resolved = target !== undefined && target !== null ? target : entityId;
    if (resolved == null || images.length === 0) return [];

    setUploading(true);
    const entryIds = [];
    try {
      for (const localUri of images) {
        const id = await queuePhotoUpload({
          entityType,
          idOrCreated: resolved,
          localUri,
        });
        if (id) entryIds.push(id);
      }
      setQueuedCount(entryIds.length);
      // Don't wait on the network — the queue owns delivery from here.
      triggerSync().catch(() => {});
    } finally {
      setUploading(false);
    }
    // The local files now belong to the queue; clear the picker state without
    // deleting them.
    setImages([]);
    return entryIds;
  };

  const reset = () => {
    setImages([]);
    setQueuedCount(0);
  };

  // Drop anything captured but never submitted (screen cancelled/abandoned).
  const discardUnsent = () => {
    images.forEach(deletePendingPhoto);
    setImages([]);
  };

  return {
    images,
    uploading,
    queuedCount,
    takePhoto,
    pickFromGallery,
    showPicker,
    removeImage,
    uploadAll,
    reset,
    discardUnsent,
  };
}
