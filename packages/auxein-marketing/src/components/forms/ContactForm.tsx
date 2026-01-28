'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  inquiryType: z.string().min(1, 'Please select an inquiry type'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

type ContactFormData = z.infer<typeof contactSchema>;

const inquiryOptions = [
  { value: '', label: 'Select an inquiry type...' },
  { value: 'insights-pro', label: 'Auxein Insights Pro' },
  { value: 'regional-insights', label: 'Regional Intelligence' },
  { value: 'vineyard-data', label: 'Vineyard Geodatabase Licensing' },
  { value: 'climate-data', label: 'Climate Dataset Licensing' },
  { value: 'coastal-risk', label: 'Coastal Inundation Risk Data' },
  { value: 'swnz', label: 'SWNZ Consulting' },
  { value: 'carbon', label: 'Carbon Accounting' },
  { value: 'climate-risk', label: 'Climate Risk Consulting' },
  { value: 'general', label: 'General Inquiry' },
  { value: 'partnership', label: 'Partnership Opportunity' },
];

interface ContactFormProps {
  defaultInquiryType?: string;
}

export function ContactForm({ defaultInquiryType }: ContactFormProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      inquiryType: defaultInquiryType || '',
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch(
        process.env.NEXT_PUBLIC_API_URL || '/api/contact',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      setStatus('success');
      reset();
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.'
      );
    }
  };

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        {status === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="text-center py-12"
          >
            <div className="w-16 h-16 rounded-full bg-olive-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-olive" />
            </div>
            <h3 className="text-2xl font-bold text-charcoal mb-2">
              Message Sent!
            </h3>
            <p className="text-charcoal-600 mb-6">
              Thanks for reaching out. I'll get back to you as soon as possible.
            </p>
            <Button
              variant="secondary"
              onClick={() => setStatus('idle')}
            >
              Send Another Message
            </Button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Name"
                placeholder="Your name"
                error={errors.name?.message}
                required
                {...register('name')}
              />
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                error={errors.email?.message}
                required
                {...register('email')}
              />
            </div>

            <Select
              label="Inquiry Type"
              options={inquiryOptions}
              error={errors.inquiryType?.message}
              required
              {...register('inquiryType')}
            />

            <Textarea
              label="Message"
              placeholder="Tell me about your project or question..."
              error={errors.message?.message}
              required
              {...register('message')}
            />

            {status === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-4 bg-terracotta-50 border border-terracotta-200 rounded-lg text-terracotta-700"
              >
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm">{errorMessage}</p>
              </motion.div>
            )}

            <Button
              type="submit"
              disabled={status === 'loading'}
              className="w-full md:w-auto"
            >
              {status === 'loading' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  Send Message
                  <Send className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}