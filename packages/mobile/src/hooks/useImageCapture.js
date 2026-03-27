// hooks/useImageCapture.js — Camera/gallery picker with upload
import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { fileService } from '../api/services';

// Map unified feed source names to file API entity types
const ENTITY_TYPE_MAP = {
  maintenance: 'asset_maintenance',
  calibration: 'asset_calibration',
  risk_action: 'risk_action',
  task: 'task',
};

export default function useImageCapture(entityType, entityId) {
  const [images, setImages] = useState([]);      // local URIs for preview
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]); // server responses

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

  const takePhoto = async () => {
    if (!(await requestPermission('camera'))) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImages(prev => [...prev, result.assets[0].uri]);
    }
  };

  const pickFromGallery = async () => {
    if (!(await requestPermission('library'))) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setImages(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const showPicker = () => {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Camera', onPress: takePhoto },
      { text: 'Gallery', onPress: pickFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadAll = async (overrideEntityId) => {
    const id = overrideEntityId || entityId;
    const mappedType = ENTITY_TYPE_MAP[entityType] || entityType;
    if (!id || images.length === 0) return [];

    setUploading(true);
    const results = [];
    for (const uri of images) {
      try {
        const res = await fileService.upload(mappedType, id, uri);
        results.push(res);
      } catch (err) {
        console.log('Upload failed:', err.message);
      }
    }
    setUploadedFiles(prev => [...prev, ...results]);
    setUploading(false);
    return results;
  };

  const reset = () => {
    setImages([]);
    setUploadedFiles([]);
  };

  return {
    images,
    uploading,
    uploadedFiles,
    takePhoto,
    pickFromGallery,
    showPicker,
    removeImage,
    uploadAll,
    reset,
  };
}
