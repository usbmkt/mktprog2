
// client/src/components/upload-modal.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, uploadFile } from '@/lib/api';
import { insertCreativeSchema as baseCreativeSchema, Campaign as CampaignType, Creative as CreativeType } from '@shared/schema';
import { X, Loader2, Upload, FileImage, FileVideo, FileTextIcon as FileText, AlertCircle, FolderSearch, Link as LinkIcon, Save } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card'; 

const creativeSchema = baseCreativeSchema.extend({
  id: z.number().optional(),
}).refine(data => {
  if (data.type === 'text' && (!data.content || !data.content.trim())) {
    return false;
  }
  return true;
}, {
  message: "Conteúdo é obrigatório para criativos de texto.",
  path: ["content"],
});

interface CreativeFormData {
  id?: number;
  name: string;
  type: 'image' | 'video' | 'text' | 'carousel';
  campaignId?: number | null;
  content?: string;
  platforms?: string[];
  fileUrl?: string | null;
}

interface Campaign {
  id: number;
  name: string;
}

interface GoogleDriveFile {
  id: string;
  name: string;
  thumbnailLink?: string;
  webViewLink?: string;
  iconLink?: string;
  webContentLink?: string;
}

interface UploadModalProps {
  onClose: () => void;
  