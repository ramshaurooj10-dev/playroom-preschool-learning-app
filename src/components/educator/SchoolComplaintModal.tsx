import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  Send,
  X,
  Paperclip,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building,
  User,
  Mail,
  Phone,
  HelpCircle,
  FileText,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { soundManager } from '../../utils/audio';
import { SchoolComplaint } from '../../types/payment';
import { saveSchoolComplaint } from '../../services/cloudSchoolSync';

interface SchoolComplaintModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSchoolName?: string;
  defaultEmail?: string;
}

export const SchoolComplaintModal: React.FC<SchoolComplaintModalProps> = ({
  isOpen,
  onClose,
  defaultSchoolName = '',
  defaultEmail = '',
}) => {
  const [schoolName, setSchoolName] = useState(defaultSchoolName);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [category, setCategory] = useState<SchoolComplaint['category']>('technical_bug');
  const [subject, setSubject] = useState('');
  const [complaintText, setComplaintText] = useState('');

  // File / Screenshot Upload State
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [attachmentSize, setAttachmentSize] = useState<string>('');
  const [attachmentType, setAttachmentType] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  // Status State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileProcess = (file: File) => {
    if (!file) return;

    // Limit to 5MB
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('File size exceeds 5MB limit. Please upload a smaller image.');
      return;
    }

    const sizeStr =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    setAttachmentName(file.name);
    setAttachmentSize(sizeStr);
    setAttachmentType(file.type);
    setErrorMessage('');

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setAttachmentDataUrl(result);
      soundManager.playPop();
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read file. Please try another image.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const removeAttachment = () => {
    setAttachmentDataUrl(null);
    setAttachmentName('');
    setAttachmentSize('');
    setAttachmentType('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    soundManager.playPop();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    soundManager.playPop();

    if (!schoolName.trim()) {
      setErrorMessage('Please enter your School or Institution Name.');
      return;
    }
    if (!contactName.trim()) {
      setErrorMessage('Please enter your Contact Person Name.');
      return;
    }
    if (!contactEmail.trim() || !contactEmail.includes('@')) {
      setErrorMessage('Please provide a valid Contact Email Address for response.');
      return;
    }
    if (!subject.trim()) {
      setErrorMessage('Please enter a Subject or Summary for the issue.');
      return;
    }
    if (!complaintText.trim() || complaintText.trim().length < 10) {
      setErrorMessage('Please describe your complaint / issue in detail (at least 10 characters).');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const complaintId = `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const payload: SchoolComplaint = {
        id: complaintId,
        schoolName: schoolName.trim(),
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim().toLowerCase(),
        phoneNumber: phoneNumber.trim() || undefined,
        category,
        subject: subject.trim(),
        complaintText: complaintText.trim(),
        attachmentDataUrl: attachmentDataUrl || undefined,
        attachmentName: attachmentName || undefined,
        attachmentType: attachmentType || undefined,
        attachmentSize: attachmentSize || undefined,
        status: 'OPEN',
        submittedAt: new Date().toISOString(),
      };

      await saveSchoolComplaint(payload);

      setSubmittedId(complaintId);
      setIsSubmitted(true);
      soundManager.playSuccess();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit complaint. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border-4 border-rose-500 overflow-hidden my-auto"
        >
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-red-700 px-6 py-5 text-white flex items-center justify-between relative shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-xs shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-300 stroke-[2.5]" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black tracking-tight uppercase">
                  Submit Complaint / Report Issue
                </h2>
                <p className="text-rose-100 text-xs font-medium">
                  Educator Hub & School Partner Support Desk
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                soundManager.playPop();
                onClose();
              }}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer border border-white/20"
              aria-label="Close"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 max-h-[80vh] overflow-y-auto">
            {isSubmitted ? (
              <div className="text-center py-8 px-4 space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800">
                    Complaint Submitted Successfully!
                  </h3>
                  <p className="text-sm font-semibold text-slate-600 mt-1 max-w-md mx-auto">
                    Your complaint has been submitted to our administration team. We will review your report and respond directly to your email (<strong className="text-slate-900">{contactEmail}</strong>) as soon as possible.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 max-w-md mx-auto text-xs text-left space-y-1.5 font-medium text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Complaint ID:</span>
                    <span className="font-mono font-bold text-slate-800">{submittedId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">School:</span>
                    <span className="font-bold text-slate-800">{schoolName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Category:</span>
                    <span className="capitalize font-bold text-slate-800">{category.replace('_', ' ')}</span>
                  </div>
                  {attachmentName && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Attached File:</span>
                      <span className="font-bold text-emerald-700">{attachmentName} ({attachmentSize})</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    soundManager.playPop();
                    onClose();
                  }}
                  className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-colors cursor-pointer text-sm"
                >
                  Close Window
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Intro Notice */}
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex items-start gap-3">
                  <HelpCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-900 font-semibold leading-relaxed">
                    If you are experiencing any issue with license access, sound/audio, classroom activities, or renewals, please provide the details below and attach a screenshot. Our administrator will review and respond directly to your email.
                  </p>
                </div>

                {errorMessage && (
                  <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 flex items-center gap-2 text-xs font-bold text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* 2 Column Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* School Name */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-indigo-600" />
                      <span>School / Institution *</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. City Grammar Preschool"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:border-rose-600 focus:outline-hidden"
                    />
                  </div>

                  {/* Contact Person Name */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Contact Person Name *</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Principal / Lead Educator"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:border-rose-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Contact Email & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Contact Email (For Reply) *</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="admin@school.edu.pk"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:border-rose-600 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-indigo-600" />
                      <span>WhatsApp / Phone (Optional)</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="0300-1234567"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:border-rose-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Issue Category & Subject */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Complaint Category</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:border-rose-600 focus:outline-hidden cursor-pointer"
                    >
                      <option value="technical_bug">Technical Bug / Sound Issue</option>
                      <option value="license_issue">License Key / Access Revoked Issue</option>
                      <option value="billing_payment">Billing / Renewal Concern</option>
                      <option value="curriculum_request">Curriculum & Worksheet Request</option>
                      <option value="general_feedback">General Feedback / Complaint</option>
                      <option value="other">Other Inquiry</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Issue Subject *</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. License expired early / Audio not playing"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:border-rose-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Detailed Description */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1">
                    Describe the issue in detail *
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Please describe the issue in detail, including steps to reproduce or what occurred, so our team can investigate promptly..."
                    value={complaintText}
                    onChange={(e) => setComplaintText(e.target.value)}
                    className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:border-rose-600 focus:outline-hidden"
                  />
                </div>

                {/* File Attachment / Screenshot Upload Box */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Attach Screenshot / Image File (Optional)</span>
                    </label>
                    <span className="text-[10px] font-bold text-slate-400">Max 5MB (PNG, JPG, PDF)</span>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*,.pdf"
                    className="hidden"
                  />

                  {attachmentDataUrl ? (
                    <div className="bg-slate-50 border-2 border-slate-300 rounded-2xl p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {attachmentType.startsWith('image/') ? (
                          <img
                            src={attachmentDataUrl}
                            alt="Screenshot preview"
                            className="w-14 h-14 object-cover rounded-xl border border-slate-300 shrink-0 bg-white"
                          />
                        ) : (
                          <div className="w-14 h-14 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-center shrink-0">
                            <FileText className="w-6 h-6 text-indigo-600" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{attachmentName}</p>
                          <p className="text-[11px] text-slate-500 font-medium">{attachmentSize}</p>
                          <span className="inline-block mt-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            ✓ Ready to attach
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={removeAttachment}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="Remove attachment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                        isDragging
                          ? 'border-rose-500 bg-rose-50/50'
                          : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                          <UploadCloud className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-slate-800">
                          Click to upload screenshot or drag & drop here
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Take a screenshot of the error and attach it for fast resolution.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:flex-1 bg-gradient-to-r from-rose-600 via-rose-700 to-red-700 hover:from-rose-700 hover:to-red-800 text-white font-black text-xs sm:text-sm uppercase tracking-wider py-3.5 px-6 rounded-xl border-b-4 border-red-950 active:border-b-0 active:translate-y-0.5 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Submitting Complaint...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 stroke-[2.5]" />
                        <span>Send Complaint to Admin</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundManager.playPop();
                      onClose();
                    }}
                    className="w-full sm:w-auto px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer border border-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
