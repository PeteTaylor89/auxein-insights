'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { trackEvent } from '@/lib/analytics';

const contactSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Please enter a valid email'),
  company: z.string().optional(),
  product: z.string().min(1, 'Please select an inquiry type'),
  message: z.string().min(10, 'Please provide more details'),
});

type ContactFormData = z.infer<typeof contactSchema>;

const productOptions = [
  { value: '', label: 'Select an option...' },
  { value: 'auxein-grow', label: 'Auxein Grow - Waitlist' },
  { value: 'regional-intelligence', label: 'Regional Intelligence' },
  { value: 'data-licensing', label: 'Data Products' },
  { value: 'climate-consulting', label: 'Climate Risk Consulting' },
  { value: 'partnership', label: 'Partnership Opportunity' },
  { value: 'wine', label: 'Sharing a Glass of Wine' },
  { value: 'general', label: 'General Inquiry' },
];

interface ContactFormProps {
  defaultProduct?: string;
  defaultInquiryType?: string; // Alias for compatibility
}

export function ContactForm({ defaultProduct = '', defaultInquiryType }: ContactFormProps) {
  // Support both prop names
  const initialProduct = defaultProduct || defaultInquiryType || '';
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: '',
      email: '',
      company: '',
      product: initialProduct,
      message: '',
    },
  });

  // Set product from URL param when component mounts or param changes
  useEffect(() => {
    if (initialProduct) {
      setValue('product', initialProduct);
    }
  }, [initialProduct, setValue]);

  const onSubmit = async (data: ContactFormData) => {
    setStatus('loading');
    setErrorMessage('');

    try {
      // Send via EmailJS
      await emailjs.send(
        process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID!,
        process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID!,
        {
          from_name: data.name,
          from_email: data.email,
          company: data.company || 'Not provided',
          inquiry_type: productOptions.find(o => o.value === data.product)?.label || data.product,
          message: data.message,
          submitted_at: new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
        },
        process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY!
      );

      // Track successful submission in Umami
      trackEvent('contact-form-submitted', {
        product: data.product,
        hasCompany: !!data.company,
      });

      setStatus('success');
      reset();
    } catch (error) {
      console.error('EmailJS error:', error);
      setErrorMessage('Failed to send message. Please try again or email directly.');
      setStatus('error');

      // Track error in Umami
      trackEvent('contact-form-error', {
        product: data.product,
      });
    }
  };

  return (
    <div>
      <AnimatePresence mode="wait">
        {status === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="text-center py-12"
          >
            <div className="w-16 h-16 rounded-full bg-olive/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-olive" />
            </div>
            <h3 className="text-xl font-bold text-charcoal mb-2">
              Message sent!
            </h3>
            <p className="text-charcoal-600 mb-6">
              Thanks for reaching out. I&apos;ll get back to you as soon as possible.
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

            <Input
              label="Company / Vineyard"
              placeholder="Your company or vineyard name (optional)"
              error={errors.company?.message}
              {...register('company')}
            />

            <Select
              label="What are you interested in?"
              options={productOptions}
              error={errors.product?.message}
              required
              {...register('product')}
            />

            <Textarea
              label="Message"
              placeholder="Tell me about your project, questions, or how I can help..."
              rows={5}
              error={errors.message?.message}
              required
              {...register('message')}
            />

            {status === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-4 bg-terracotta/10 border border-terracotta/20 rounded-lg text-terracotta"
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