import { useCallback, useEffect, useRef, useState } from 'react';
import CampaignDetailPage from './pages/CampaignDetailPage.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import { MAX_CAMPAIGN_CONTACTS } from './utils/format.js';

const MAX_UPLOAD_SIZE = 4 * 1024 * 1024; // Vercel request limit is 4.5 MB
const DAILY_SEND_LIMIT = 30;

const defaultEmailBody = `Hello,

Thank you for considering my application for the Node.js Developer role.

I am writing to express my interest in the backend engineering opportunity and would appreciate the opportunity to discuss how my experience aligns with your needs.

I have attached my resume for your review and would be grateful for the chance to speak further.

Best regards,
[Your Name]
`;

const defaultOverview = { totalContacts: 0, queuedEmails: 0, sentEmails: 0, failures: 0, replies: 0 };

const defaultJobTemplates = [
  {
    id: 'nodejs-backend',
    role: 'Backend Developer',
    label: 'Node.js Backend',
    subject: 'Application for Backend Developer Role',
    body: `Hello,

Thank you for considering my application for the Node.js Backend Developer role.

I am very interested in the opportunity to contribute to your backend engineering team and help build scalable APIs, data layers, and production-grade services.

I have attached my resume for your review and would welcome the opportunity to discuss how my experience aligns with your requirements.

Best regards,
[Your Name]
`,
  },
  {
    id: 'react-frontend',
    role: 'Frontend Developer',
    label: 'React Frontend',
    subject: 'Application for Frontend Developer Role',
    body: `Hello,

Thank you for your time and consideration for the React Frontend Developer opportunity.

I am excited about the chance to contribute to user-facing product experiences and build polished, responsive interfaces that align with modern frontend best practices.

My resume is attached for reference, and I would be grateful for the opportunity to speak further about how I can contribute to your team.

Best regards,
[Your Name]
`,
  },
  {
    id: 'fullstack-mern',
    role: 'Full Stack Developer',
    label: 'Full Stack MERN',
    subject: 'Application for Full Stack Developer Role',
    body: `Hello,

Thank you for considering my application for the Full Stack Developer position.

I am interested in the opportunity to work across both frontend and backend systems, especially in product development using modern JavaScript stacks and scalable web architecture.

I have attached my resume for your review and would welcome a chance to discuss how my experience can support your team goals.

Best regards,
[Your Name]
`,
  },
  {
    id: 'ai-engineer',
    role: 'AI Engineer',
    label: 'AI Roles',
    subject: 'Application for AI Engineer Role',
    body: `Hello,

Thank you for considering my application for the AI Engineer position.

I am excited by the opportunity to work on intelligent systems, model-driven products, and data-informed automation that improve user experience and business outcomes.

I have attached my resume for review and would appreciate the opportunity to discuss how my background in machine learning and product development can contribute to your team.

Best regards,
[Your Name]
`,
  },
];

const getStoredTemplates = () => {
  try {
    const raw = localStorage.getItem('email-job-templates');
    if (!raw) return defaultJobTemplates;

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
    return defaultJobTemplates;
  } catch (_error) {
    return defaultJobTemplates;
  }
};

const formatCampaignDate = (value) => {
  if (!value) return 'Not scheduled';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const formatFileSize = (value) => {
  if (!Number.isFinite(value) || value <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem('token')));
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [overview, setOverview] = useState(defaultOverview);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignDetail, setCampaignDetail] = useState(null);
  const [allContacts, setAllContacts] = useState([]);
  const [recipientContacts, setRecipientContacts] = useState([]);
  const [resume, setResume] = useState(null);
  const [uploadedResumeId, setUploadedResumeId] = useState(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [contactUploadSummary, setContactUploadSummary] = useState(null);
  const [uploadingContacts, setUploadingContacts] = useState(false);
  const [recipientMode, setRecipientMode] = useState('upload');
  const [sendFirst, setSendFirst] = useState(false);
  const [manualEmailsInput, setManualEmailsInput] = useState('');
  const [manualEmailSummary, setManualEmailSummary] = useState(null);
  const [manualEmailsLoading, setManualEmailsLoading] = useState(false);
  const [jobTemplates, setJobTemplates] = useState(() => getStoredTemplates());
  const [selectedTemplateId, setSelectedTemplateId] = useState('nodejs-backend');
  const [templateForm, setTemplateForm] = useState({ label: '', role: '', subject: '', body: '' });
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateError, setTemplateError] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateDeleteTarget, setTemplateDeleteTarget] = useState(null);
  const [campaignName, setCampaignName] = useState('Node.js Backend Applications');
  const [subject, setSubject] = useState('Application for Backend Developer Role');
  const [body, setBody] = useState(defaultJobTemplates[0].body);
  const [dailyLimit, setDailyLimit] = useState(DAILY_SEND_LIMIT);
  const [batchSize, setBatchSize] = useState(10);
  const [delayMs, setDelayMs] = useState(60000);
  const [startDateTime, setStartDateTime] = useState(() => {
    const now = new Date(Date.now() + 60 * 1000);
    const offset = new Date().getTimezoneOffset();
    const localDate = new Date(now.getTime() - offset * 60000);
    return localDate.toISOString().slice(0, 16);
  });
  const [timezoneLabel] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time');
  const [statusMessage, setStatusMessage] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [campaignScheduleDraft, setCampaignScheduleDraft] = useState(() => {
    const now = new Date(Date.now() + 60 * 1000);
    const offset = new Date().getTimezoneOffset();
    const localDate = new Date(now.getTime() - offset * 60000);
    return localDate.toISOString().slice(0, 16);
  });
  const [campaignAdjustments, setCampaignAdjustments] = useState({
    dailyLimit: DAILY_SEND_LIMIT,
    batchSize: 10,
    delayMs: 60000,
  });
  const [activePage, setActivePage] = useState('dashboard');
  const [viewCampaignId, setViewCampaignId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('all');
  const [campaignSortKey, setCampaignSortKey] = useState('createdAt-desc');
  const [campaignPage, setCampaignPage] = useState(1);

  const persistToken = (nextToken) => {
    setToken(nextToken);
    setIsAuthenticated(Boolean(nextToken));
    if (nextToken) {
      localStorage.setItem('token', nextToken);
    } else {
      localStorage.removeItem('token');
    }
  };

  const requestWithAuth = useCallback(async (url, options = {}) => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      throw new Error('Please login to continue.');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${currentToken}`,
      },
    });

    if (response.status === 401) {
      localStorage.removeItem('token');
      setToken('');
      setIsAuthenticated(false);
      throw new Error('Your session expired. Please login again.');
    }

    return response;
  }, []);

  const refreshCampaigns = useCallback(async () => {
    try {
      const response = await requestWithAuth('/api/campaigns');
      if (!response.ok) return;
      const data = await response.json();
      setCampaigns(data.campaigns || []);
    } catch (_error) {
      // Keep the current list if the refresh fails.
    }
  }, [requestWithAuth]);

  const resetCurrentRecipientList = () => {
    setRecipientContacts([]);
    setSelectedFile(null);
    setContactUploadSummary(null);
    setManualEmailSummary(null);
    setManualEmailsInput('');
    if (contactInputRef.current) {
      contactInputRef.current.value = '';
    }
  };

  const contactInputRef = useRef(null);
  const resumeInputRef = useRef(null);

  const clearContactUpload = () => {
    setSelectedFile(null);
    setContactUploadSummary(null);
    if (contactInputRef.current) {
      contactInputRef.current.value = '';
    }
  };

  const removeResume = async () => {
    try {
      if (uploadedResumeId) {
        await requestWithAuth(`/api/resumes/${uploadedResumeId}`, { method: 'DELETE' });
      }
    } catch (error) {
      setStatusMessage(error.message || 'Could not remove the uploaded resume.');
      return;
    }

    setResume(null);
    setUploadedResumeId(null);
    if (resumeInputRef.current) {
      resumeInputRef.current.value = '';
    }
    setStatusMessage('Resume removed successfully.');
  };

  const resetCreateForm = () => {
    const defaultTemplate = jobTemplates[0] || defaultJobTemplates[0];
    setSelectedTemplateId(defaultTemplate.id);
    setCampaignName(`${defaultTemplate.role} Applications`);
    setSubject(defaultTemplate.subject);
    setBody(defaultTemplate.body);
    setDailyLimit(DAILY_SEND_LIMIT);
    setBatchSize(10);
    setDelayMs(60000);
    setSendFirst(false);
    setStartDateTime(() => {
      const now = new Date(Date.now() + 60 * 1000);
      const offset = new Date().getTimezoneOffset();
      const localDate = new Date(now.getTime() - offset * 60000);
      return localDate.toISOString().slice(0, 16);
    });
    setCampaignScheduleDraft(() => {
      const now = new Date(Date.now() + 60 * 1000);
      const offset = new Date().getTimezoneOffset();
      const localDate = new Date(now.getTime() - offset * 60000);
      return localDate.toISOString().slice(0, 16);
    });
    setCampaignAdjustments({ dailyLimit: DAILY_SEND_LIMIT, batchSize: 10, delayMs: 60000 });
  };

  const applyTemplate = (template) => {
    setSelectedTemplateId(template.id);
    setCampaignName(`${template.role} Applications`);
    setSubject(template.subject);
    setBody(template.body);
    setTemplatePickerOpen(false);
  };

  const persistTemplates = (nextTemplates) => {
    setJobTemplates(nextTemplates);
    localStorage.setItem('email-job-templates', JSON.stringify(nextTemplates));
  };

  const closeTemplateForm = () => {
    setTemplateFormOpen(false);
    setTemplateError('');
    setTemplateSaving(false);
    setEditingTemplateId(null);
    setTemplateForm({ label: '', role: '', subject: '', body: '' });
  };

  const openTemplateForm = (template = null) => {
    if (template) {
      setEditingTemplateId(template.id);
      setTemplateForm({
        label: template.label || template.role || '',
        role: template.role || '',
        subject: template.subject || '',
        body: template.body || '',
      });
    } else {
      setEditingTemplateId(null);
      setTemplateForm({ label: '', role: '', subject: '', body: '' });
    }
    setTemplateError('');
    setTemplateFormOpen(true);
  };

  const saveTemplateForm = () => {
    if (templateSaving) return;

    const label = templateForm.label.trim();
    const role = templateForm.role.trim();
    const subjectValue = templateForm.subject.trim();
    const bodyValue = templateForm.body.trim();

    if (!label || !role || !subjectValue || !bodyValue) {
      setTemplateError('Template name, role, subject, and email body are required.');
      setStatusMessage('Template validation failed. Please complete all required fields.');
      return;
    }

    setTemplateSaving(true);
    setTemplateError('');

    try {
      const normalizedTemplate = {
        id: editingTemplateId || `template-${Date.now()}`,
        role,
        label,
        subject: subjectValue,
        body: bodyValue,
      };

      const nextTemplates = editingTemplateId
        ? jobTemplates.map((template) => template.id === editingTemplateId ? normalizedTemplate : template)
        : [...jobTemplates, normalizedTemplate];

      persistTemplates(nextTemplates);
      setSelectedTemplateId(normalizedTemplate.id);
      applyTemplate(normalizedTemplate);
      setTemplateFormOpen(false);
      setEditingTemplateId(null);
      setTemplateForm({ label: '', role: '', subject: '', body: '' });
      setStatusMessage(editingTemplateId ? 'Template updated successfully.' : 'Template saved successfully.');
    } catch (error) {
      setTemplateError('Could not save the template. Please try again.');
      setStatusMessage(error.message || 'Could not save the template.');
    } finally {
      setTemplateSaving(false);
    }
  };

  const deleteTemplate = (templateId) => {
    const target = jobTemplates.find((template) => template.id === templateId);
    if (!target) return;

    setTemplateDeleteTarget(target);
  };

  const confirmDeleteTemplate = () => {
    if (!templateDeleteTarget) return;

    try {
      const nextTemplates = jobTemplates.filter((template) => template.id !== templateDeleteTarget.id);
      const safeTemplates = nextTemplates.length ? nextTemplates : defaultJobTemplates;
      persistTemplates(safeTemplates);

      const nextSelected = safeTemplates[0];
      if (nextSelected) {
        setSelectedTemplateId(nextSelected.id);
        applyTemplate(nextSelected);
      }

      setStatusMessage(`Template "${templateDeleteTarget.label || templateDeleteTarget.role}" deleted successfully.`);
    } catch (error) {
      setStatusMessage(error.message || 'Could not delete the template.');
    } finally {
      setTemplateDeleteTarget(null);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      persistToken(data.token);
      setStatusMessage('Login successful.');
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = () => {
    persistToken('');
    setOverview(defaultOverview);
    setCampaigns([]);
    setAllContacts([]);
    setRecipientContacts([]);
    setSelectedCampaignId(null);
    setActivePage('dashboard');
    setStatusMessage('Logged out successfully.');
    setLoginError('');
    resetCreateForm();
  };

  useEffect(() => {
    const loadDashboard = async () => {
      if (!isAuthenticated) return;

      try {
        setIsLoading(true);
        setDashboardError('');
        const [overviewResponse, contactsResponse, campaignsResponse] = await Promise.all([
          requestWithAuth('/api/dashboard/overview'),
          requestWithAuth('/api/contacts'),
          requestWithAuth('/api/campaigns'),
        ]);

        if (overviewResponse.ok) {
          const overviewData = await overviewResponse.json();
          setOverview(overviewData.overview || defaultOverview);
        }

        if (contactsResponse.ok) {
          const contactsData = await contactsResponse.json();
          setAllContacts(contactsData.contacts || []);
          setRecipientContacts([]);
        }

        if (campaignsResponse.ok) {
          const campaignsData = await campaignsResponse.json();
          setCampaigns(campaignsData.campaigns || []);
        }
      } catch (error) {
        const message = error.message || 'Could not load dashboard.';
        setDashboardError(message);
        setStatusMessage(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [isAuthenticated]);

  const selectedCampaign = campaigns.find((campaign) => campaign._id === selectedCampaignId) || null;

  useEffect(() => {
    if (!selectedCampaignId) {
      setCampaignDetail(null);
      return;
    }

    const loadCampaignDetail = async () => {
      try {
        const response = await requestWithAuth(`/api/campaigns/${selectedCampaignId}/detail`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to load campaign detail');
        setCampaignDetail(data.detail || null);
      } catch (error) {
        setCampaignDetail(null);
      }
    };

    loadCampaignDetail();
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaign) return;

    setCampaignName(selectedCampaign.name || 'Node.js Backend Applications');
    setSubject(selectedCampaign.subject || 'Application for Backend Developer Role');
    setBody(selectedCampaign.body || defaultEmailBody);
    setDailyLimit(Number(selectedCampaign.dailyLimit || 10));
    setBatchSize(Number(selectedCampaign.batchSize || 10));
    setDelayMs(Number(selectedCampaign.delayMs || 60000));
    setSendFirst(Boolean(selectedCampaign.sendFirst));
    setCampaignAdjustments({
      dailyLimit: Number(selectedCampaign.dailyLimit || 10),
      batchSize: Number(selectedCampaign.batchSize || 10),
      delayMs: Number(selectedCampaign.delayMs || 60000),
    });

    if (selectedCampaign.startDateTime) {
      const formatted = new Date(selectedCampaign.startDateTime);
      if (!Number.isNaN(formatted.getTime())) {
        const offset = new Date().getTimezoneOffset();
        const localDate = new Date(formatted.getTime() - offset * 60000);
        setStartDateTime(localDate.toISOString().slice(0, 16));
        setCampaignScheduleDraft(localDate.toISOString().slice(0, 16));
      }
    }
  }, [selectedCampaignId, campaigns]);

  const handleManualEmailImport = async () => {
    const rawValue = manualEmailsInput.trim();
    if (!rawValue) {
      setStatusMessage('Paste at least one valid email address to continue.');
      return;
    }

    setManualEmailsLoading(true);
    setStatusMessage('Validating and adding email list...');

    try {
      const response = await requestWithAuth('/api/contacts/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: rawValue }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to add the pasted email list.');
      }

      const importedContacts = data.contacts || [];
      setRecipientContacts(importedContacts);
      setSelectedFile(null);
      setContactUploadSummary(null);

      setManualEmailSummary(data.summary || {
        total: importedContacts.length,
        valid: importedContacts.length,
        invalid: 0,
        duplicate: 0,
        imported: importedContacts.length,
      });
      setManualEmailsInput('');
      setStatusMessage(`Added ${importedContacts.length} recipients from the pasted email list.`);
    } catch (error) {
      setManualEmailSummary(null);
      setStatusMessage(error.message);
    } finally {
      setManualEmailsLoading(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!recipientContacts.length) {
      setStatusMessage('Add at least one contact first. The campaign must have at least one recipient.');
      return;
    }

    if (recipientContacts.length > MAX_CAMPAIGN_CONTACTS) {
      setStatusMessage(`This list has ${recipientContacts.length} contacts. A campaign can have at most ${MAX_CAMPAIGN_CONTACTS}. Split the file into smaller lists.`);
      return;
    }

    try {
      const payload = {
        name: campaignName,
        subject,
        body,
        dailyLimit,
        batchSize,
        delayMs,
        startDateTime: startDateTime ? new Date(startDateTime).toISOString() : undefined,
        contactIds: recipientContacts.map((contact) => contact._id || contact.id),
        resumeId: uploadedResumeId || undefined,
        approvalRequired: true,
        sendFirst,
      };

      const url = selectedCampaignId ? `/api/campaigns/${selectedCampaignId}` : '/api/campaigns';
      const method = selectedCampaignId ? 'PATCH' : 'POST';

      setStatusMessage(selectedCampaignId ? 'Updating campaign...' : 'Creating campaign...');
      const response = await requestWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        const message = Array.isArray(data.message) ? data.message.join(' ') : data.message;
        throw new Error(message || (selectedCampaignId ? 'Failed to update campaign' : 'Failed to create campaign'));
      }

      if (selectedCampaignId) {
        setCampaigns((current) => current.map((campaign) => (
          campaign._id === selectedCampaignId ? { ...campaign, ...data.campaign } : campaign
        )));
        setStatusMessage('Campaign updated successfully.');
      } else {
        setSelectedCampaignId(data.campaign._id);
        setCampaigns((current) => [data.campaign, ...current]);
        setStatusMessage('Campaign created successfully.');
      }
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const handleContactUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedExtensions = /\.(csv|xlsx|xls)$/i;
    const isAllowedType = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.type) || allowedExtensions.test(file.name);

    if (!isAllowedType) {
      setSelectedFile(null);
      setContactUploadSummary(null);
      setStatusMessage('Unsupported file type. Please upload a CSV, XLSX, or XLS file.');
      if (event.target) event.target.value = '';
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      setSelectedFile(null);
      setContactUploadSummary(null);
      setStatusMessage(`Contact file is too large. Maximum allowed size is ${formatFileSize(MAX_UPLOAD_SIZE)}.`);
      if (event.target) event.target.value = '';
      return;
    }

    setRecipientContacts([]);
    setSelectedFile(file);
    setContactUploadSummary(null);
    setManualEmailSummary(null);
    setUploadingContacts(true);
    setStatusMessage('Uploading contacts...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await requestWithAuth('/api/contacts/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to upload contacts');
      }

      const nextSummary = {
        total: data.summary?.total ?? 0,
        valid: data.summary?.valid ?? 0,
        invalid: data.summary?.invalid ?? 0,
        duplicate: data.summary?.duplicate ?? 0,
        imported: data.summary?.imported ?? 0,
      };

      setContactUploadSummary(nextSummary);

      const importedContacts = Array.isArray(data.imported) ? data.imported.map((contact) => ({
        _id: contact.id,
        email: contact.email,
      })) : [];
      setRecipientContacts(importedContacts);
      setStatusMessage(importedContacts.length > MAX_CAMPAIGN_CONTACTS
        ? `Imported ${nextSummary.imported} contacts, but a campaign can have at most ${MAX_CAMPAIGN_CONTACTS}. Upload a smaller file for this campaign.`
        : `Contacts uploaded: ${nextSummary.imported} valid records imported.`);
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setUploadingContacts(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleResumeUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setResume(null);
      setUploadedResumeId(null);
      setStatusMessage('Only PDF resumes are supported for attachment.');
      if (event.target) event.target.value = '';
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      setResume(null);
      setUploadedResumeId(null);
      setStatusMessage(`Resume is too large. Maximum allowed size is ${formatFileSize(MAX_UPLOAD_SIZE)}.`);
      if (event.target) event.target.value = '';
      return;
    }

    setResume(file);
    setResumeUploading(true);
    setStatusMessage('Uploading resume...');

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const response = await requestWithAuth('/api/resumes/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to upload resume');
      }

      setUploadedResumeId(data.resume?._id || null);
      setStatusMessage('Resume uploaded successfully.');
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setResumeUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleUpdateCampaignSchedule = async () => {
    if (!selectedCampaignId) {
      setStatusMessage('Select a campaign first.');
      return;
    }

    try {
      const response = await requestWithAuth(`/api/campaigns/${selectedCampaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDateTime: campaignScheduleDraft ? new Date(campaignScheduleDraft).toISOString() : undefined,
          dailyLimit: Number(campaignAdjustments.dailyLimit || 1),
          batchSize: Number(campaignAdjustments.batchSize || 1),
          delayMs: Number(campaignAdjustments.delayMs || 60000),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to update campaign schedule');

      setCampaigns((current) => current.map((campaign) => (
        campaign._id === selectedCampaignId ? { ...campaign, ...data.campaign } : campaign
      )));
      setStatusMessage('Campaign schedule updated successfully.');
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const handleDeleteCampaign = async (campaignIdOverride = selectedCampaignId) => {
    const targetId = campaignIdOverride;
    if (!targetId) {
      setStatusMessage('Select a campaign first.');
      return;
    }

    try {
      const response = await requestWithAuth(`/api/campaigns/${targetId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to delete campaign');

      setCampaigns((current) => current.filter((campaign) => campaign._id !== targetId));
      if (selectedCampaignId === targetId) {
        setSelectedCampaignId(null);
        resetCreateForm();
      }
      if (viewCampaignId === targetId) {
        setViewCampaignId(null);
        setActivePage('campaigns');
      }
      setStatusMessage(data.message || 'Campaign deleted successfully.');
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const handleCampaignAction = async (action, campaignIdOverride = selectedCampaignId) => {
    const targetId = campaignIdOverride;
    if (!targetId) {
      setStatusMessage('Create a campaign first.');
      return false;
    }

    const actionLabels = {
      start: 'start',
      pause: 'pause',
      resume: 'resume',
      cancel: 'cancel',
    };
    const actionMessages = {
      start: 'started',
      pause: 'paused',
      resume: 'resumed',
      cancel: 'cancelled',
    };

    const label = actionLabels[action] || action;
    const message = actionMessages[action] || action;
    const confirmed = window.confirm(`Are you sure you want to ${label} this campaign?`);
    if (!confirmed) {
      return false;
    }

    try {
      setStatusMessage(`Processing ${label}...`);
      const response = await requestWithAuth(`/api/campaigns/${targetId}/${action}`, {
        method: 'POST',
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Failed to ${label} campaign`);

      setCampaigns((current) => current.map((campaign) => (
        campaign._id === targetId ? { ...campaign, status: data.campaign?.status || campaign.status } : campaign
      )));
      if (selectedCampaignId === targetId) {
        setSelectedCampaignId(targetId);
      }
      setStatusMessage(`Campaign ${message} successfully.`);
      refreshCampaigns();
      return true;
    } catch (error) {
      setStatusMessage(error.message);
      window.alert(error.message);
      return false;
    }
  };

  const handleSendTestEmail = async () => {
    if (!selectedCampaignId) {
      setStatusMessage('Create a campaign first, then send the test email.');
      return;
    }

    try {
      const response = await requestWithAuth(`/api/campaigns/${selectedCampaignId}/test-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No email given: the server sends the test to your own Gmail (SMTP_USER).
        body: JSON.stringify({}),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to send test email');
      setStatusMessage(data.message || 'Test email sent.');
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const campaignSummary = campaigns.reduce((accumulator, campaign) => {
    accumulator.total += 1;
    const status = String(campaign.status || 'draft').toLowerCase();
    accumulator[status] = (accumulator[status] || 0) + 1;
    return accumulator;
  }, {
    total: 0,
    draft: 0,
    queued: 0,
    running: 0,
    paused: 0,
    completed: 0,
    cancelled: 0,
    failed: 0,
  });

  const openNewCampaign = () => {
    setSelectedCampaignId(null);
    resetCreateForm();
    setActivePage('create');
  };

  const openCampaignEditor = async (campaignId) => {
    setSelectedCampaignId(campaignId);
    setActivePage('create');
    setRecipientMode('upload');
    setSelectedFile(null);
    setContactUploadSummary(null);
    setManualEmailSummary(null);

    try {
      const response = await requestWithAuth(`/api/campaigns/${campaignId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load campaign recipients.');
      setRecipientContacts((data.campaign?.contacts || []).map((contact) => ({ _id: contact._id, email: contact.email })));
      setResume(null);
      setUploadedResumeId(data.campaign?.resumeId || null);
    } catch (error) {
      setRecipientContacts([]);
      setStatusMessage(error.message);
    }
  };

  const openCampaignView = (campaignId) => {
    setViewCampaignId(campaignId);
    setActivePage('campaign-detail');
  };

  const confirmAndDeleteCampaign = async (campaignId) => {
    if (window.confirm('Delete this campaign permanently? This action cannot be undone.')) {
      await handleDeleteCampaign(campaignId);
    }
  };

  const recentCampaigns = [...campaigns]
    .sort((left, right) => new Date(right.createdAt || right.startDateTime || 0) - new Date(left.createdAt || left.startDateTime || 0))
    .slice(0, 5);

  const campaignStatusOptions = ['all', 'draft', 'queued', 'running', 'paused', 'completed', 'cancelled', 'failed'];

  const filteredCampaigns = [...campaigns]
    .filter((campaign) => {
      const status = String(campaign.status || 'draft').toLowerCase();
      const searchTerm = campaignSearch.trim().toLowerCase();
      const matchesStatus = campaignStatusFilter === 'all' || status === campaignStatusFilter;
      const matchesSearch = !searchTerm || [campaign.name, campaign.subject, campaign.status, campaign.role].join(' ').toLowerCase().includes(searchTerm);
      return matchesStatus && matchesSearch;
    })
    .sort((left, right) => {
      const [key, direction] = campaignSortKey.split('-');
      const multiplier = direction === 'asc' ? 1 : -1;

      if (key === 'name') {
        return String(left.name || '').localeCompare(String(right.name || '')) * multiplier;
      }

      if (key === 'status') {
        return String(left.status || 'draft').localeCompare(String(right.status || 'draft')) * multiplier;
      }

      const leftTime = new Date(left.createdAt || left.startDateTime || 0).getTime();
      const rightTime = new Date(right.createdAt || right.startDateTime || 0).getTime();
      return (leftTime - rightTime) * multiplier;
    });

  const campaignPageSize = 8;
  const totalCampaignPages = Math.max(1, Math.ceil(filteredCampaigns.length / campaignPageSize));
  const paginatedCampaigns = filteredCampaigns.slice((campaignPage - 1) * campaignPageSize, campaignPage * campaignPageSize);

  const getCampaignStatusClass = (status) => {
    const normalized = String(status || 'draft').toLowerCase();
    return `campaign-status-pill status-pill--${normalized}`;
  };

  const getCampaignActions = (campaign) => {
    const status = String(campaign.status || 'draft').toLowerCase();
    const actions = [];

    actions.push({ label: 'View', onClick: () => openCampaignView(campaign._id) });
    actions.push({ label: 'Edit', onClick: () => openCampaignEditor(campaign._id) });

    if (status === 'draft' || status === 'paused' || status === 'cancelled' || status === 'failed') {
      actions.push({ label: 'Start', onClick: () => handleCampaignAction('start', campaign._id) });
    }

    if (status === 'running' || status === 'queued') {
      actions.push({ label: 'Pause', onClick: () => handleCampaignAction('pause', campaign._id) });
    }

    if (status === 'paused') {
      actions.push({ label: 'Resume', onClick: () => handleCampaignAction('resume', campaign._id) });
    }

    if (status !== 'cancelled' && status !== 'completed') {
      actions.push({ label: 'Cancel', danger: true, onClick: () => handleCampaignAction('cancel', campaign._id) });
    }

    actions.push({ label: 'Delete', danger: true, onClick: () => confirmAndDeleteCampaign(campaign._id) });

    return actions;
  };

  const renderOverviewPage = () => (
    <>
      <div className="page-header">
        <div className="page-header-copy">
          <p className="eyebrow">Overview</p>
          <h2>Dashboard</h2>
          <p className="page-subtitle">Monitor your outreach campaigns and email performance.</p>
        </div>
        <button className="primary-btn" onClick={openNewCampaign}>Create campaign</button>
      </div>

      {dashboardError && (
        <div className="notice-panel notice-panel--error" role="alert">
          {dashboardError}
        </div>
      )}

      {isLoading ? (
        <div className="panel loading-panel" aria-live="polite">
          <div className="loading-row" />
          <div className="loading-row short" />
          <div className="loading-grid">
            <div className="loading-card" />
            <div className="loading-card" />
            <div className="loading-card" />
            <div className="loading-card" />
            <div className="loading-card" />
          </div>
        </div>
      ) : (
        <>
          <section className="stats-grid" aria-label="Dashboard metrics">
            <div className="stat-card">
              <span>Total contacts</span>
              <strong>{overview.totalContacts}</strong>
            </div>
            <div className="stat-card">
              <span>Queued emails</span>
              <strong>{overview.queuedEmails}</strong>
            </div>
            <div className="stat-card">
              <span>Sent emails</span>
              <strong>{overview.sentEmails}</strong>
            </div>
            <div className="stat-card">
              <span>Failures</span>
              <strong>{overview.failures}</strong>
            </div>
            <div className="stat-card">
              <span>Replies</span>
              <strong>{overview.replies}</strong>
            </div>
            <div className="stat-card">
              <span>Sent today</span>
              <strong>{overview.sentToday ?? 0} / {overview.dailySendLimit ?? DAILY_SEND_LIMIT}</strong>
            </div>
          </section>

          <section className="panel summary-panel" aria-label="Campaign overview section">
            <div className="section-header">
              <h3>Campaign overview</h3>
              <span className="section-badge">{campaignSummary.total}</span>
            </div>

            <div className="summary-grid">
              <div className="summary-card"><span>Total</span><strong>{campaignSummary.total}</strong></div>
              <div className="summary-card"><span>Draft</span><strong>{campaignSummary.draft || 0}</strong></div>
              <div className="summary-card"><span>Queued</span><strong>{campaignSummary.queued || 0}</strong></div>
              <div className="summary-card"><span>Running</span><strong>{campaignSummary.running || 0}</strong></div>
              <div className="summary-card"><span>Paused</span><strong>{campaignSummary.paused || 0}</strong></div>
              <div className="summary-card"><span>Completed</span><strong>{campaignSummary.completed || 0}</strong></div>
              <div className="summary-card"><span>Cancelled</span><strong>{campaignSummary.cancelled || 0}</strong></div>
              <div className="summary-card"><span>Failed</span><strong>{campaignSummary.failed || 0}</strong></div>
            </div>
          </section>

          <section className="panel recent-panel" aria-label="Recent campaigns">
            <div className="section-header">
              <h3>Recent campaigns</h3>
              <button className="secondary-btn small-btn" type="button" onClick={openNewCampaign}>New campaign</button>
            </div>

            {recentCampaigns.length === 0 ? (
              <div className="empty-state-box">
                <p>No campaigns yet.</p>
                <button className="primary-btn small-btn" type="button" onClick={openNewCampaign}>Create your first campaign</button>
              </div>
            ) : (
              <div className="recent-campaign-list">
                {recentCampaigns.map((campaign) => (
                  <button
                    key={campaign._id}
                    type="button"
                    className="recent-campaign-row"
                    onClick={() => openCampaignView(campaign._id)}
                  >
                    <div className="recent-campaign-copy">
                      <strong>{campaign.name}</strong>
                      <span>{campaign.subject || 'No subject'}</span>
                    </div>
                    <div className="recent-campaign-meta">
                      <span className={`campaign-status-pill status-pill--${String(campaign.status || 'draft').toLowerCase()}`}>
                        {campaign.status || 'draft'}
                      </span>
                      <small>{formatCampaignDate(campaign.startDateTime || campaign.createdAt)}</small>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );

  const renderCampaignsPage = () => (
    <section className="panel full-panel">
      <div className="page-header compact-page-header">
        <div>
          <p className="eyebrow">Campaigns</p>
          <h2>Campaigns</h2>
          <p className="page-subtitle">Track active outreach, review status, and manage campaign execution.</p>
        </div>
        <button className="primary-btn" onClick={openNewCampaign}>Create campaign</button>
      </div>

      <div className="summary-grid compact-grid">
        <div className="summary-card"><span>Total</span><strong>{campaignSummary.total}</strong></div>
        <div className="summary-card"><span>Queued</span><strong>{campaignSummary.queued || 0}</strong></div>
        <div className="summary-card"><span>Running</span><strong>{campaignSummary.running || 0}</strong></div>
        <div className="summary-card"><span>Completed</span><strong>{campaignSummary.completed || 0}</strong></div>
        <div className="summary-card"><span>Draft</span><strong>{campaignSummary.draft || 0}</strong></div>
        <div className="summary-card"><span>Paused</span><strong>{campaignSummary.paused || 0}</strong></div>
        <div className="summary-card"><span>Cancelled</span><strong>{campaignSummary.cancelled || 0}</strong></div>
        <div className="summary-card"><span>Failed</span><strong>{campaignSummary.failed || 0}</strong></div>
      </div>

      <div className="campaign-toolbar">
        <label className="campaign-search">
          <span className="sr-only">Search campaigns</span>
          <input
            type="search"
            value={campaignSearch}
            onChange={(event) => {
              setCampaignSearch(event.target.value);
              setCampaignPage(1);
            }}
            placeholder="Search campaigns"
          />
        </label>

        <label className="campaign-filter">
          <span className="sr-only">Filter campaigns by status</span>
          <select
            value={campaignStatusFilter}
            onChange={(event) => {
              setCampaignStatusFilter(event.target.value);
              setCampaignPage(1);
            }}
          >
            {campaignStatusOptions.map((status) => (
              <option key={status} value={status}>{status === 'all' ? 'All statuses' : status.charAt(0).toUpperCase() + status.slice(1)}</option>
            ))}
          </select>
        </label>

        <label className="campaign-sort">
          <span className="sr-only">Sort campaigns</span>
          <select value={campaignSortKey} onChange={(event) => setCampaignSortKey(event.target.value)}>
            <option value="createdAt-desc">Newest first</option>
            <option value="createdAt-asc">Oldest first</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="status-asc">Status A–Z</option>
          </select>
        </label>
      </div>

      <div className="campaign-table-shell">
        {filteredCampaigns.length === 0 ? (
          <div className="empty-state-box empty-table-state">
            <p>No campaigns match the current filters.</p>
          </div>
        ) : (
          <>
            <div className="campaign-table-wrap">
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Target</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th>Recipients</th>
                    <th>Progress</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCampaigns.map((campaign) => {
                    const status = String(campaign.status || 'draft').toLowerCase();
                    const sentCount = Number(campaign.sentCount || 0);
                    const totalContacts = Number(campaign.totalContacts || 0);
                    const percent = totalContacts > 0 ? Math.min(100, Math.round((sentCount / totalContacts) * 100)) : 0;
                    const actions = getCampaignActions(campaign);

                    return (
                      <tr key={campaign._id} className={selectedCampaignId === campaign._id ? 'campaign-row active' : 'campaign-row'}>
                        <td>
                          <div className="campaign-name-stack">
                            <strong>
                              {campaign.name || 'Untitled campaign'}
                              {campaign.sendFirst ? <span className="send-first-badge">Send first</span> : null}
                            </strong>
                            <span>{campaign.subject || 'No subject'}</span>
                          </div>
                        </td>
                        <td>{campaign.name || 'N/A'}</td>
                        <td>
                          <span className={getCampaignStatusClass(status)}>{status}</span>
                        </td>
                        <td>{formatCampaignDate(campaign.startDateTime || campaign.createdAt)}</td>
                        <td>{totalContacts > 0 ? totalContacts : '—'}</td>
                        <td>
                          {totalContacts > 0 ? (
                            <div className="campaign-progress">
                              <div className="campaign-progress-bar">
                                <span style={{ width: `${percent}%` }} />
                              </div>
                              <small>{sentCount}/{totalContacts}</small>
                            </div>
                          ) : (
                            <span className="muted-text">—</span>
                          )}
                        </td>
                        <td>
                          <div className="campaign-action-group">
                            {actions.slice(0, 3).map((action) => (
                              <button
                                key={`${campaign._id}-${action.label}`}
                                type="button"
                                className={action.danger ? 'table-action danger' : 'table-action'}
                                onClick={action.onClick}
                              >
                                {action.label}
                              </button>
                            ))}
                            {actions.length > 3 ? (
                              <div className="more-actions">
                                {actions.slice(3).map((action) => (
                                  <button
                                    key={`${campaign._id}-${action.label}-more`}
                                    type="button"
                                    className={action.danger ? 'table-action danger' : 'table-action'}
                                    onClick={action.onClick}
                                  >
                                    {action.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-campaign-list">
              {paginatedCampaigns.map((campaign) => {
                const status = String(campaign.status || 'draft').toLowerCase();
                const totalContacts = Number(campaign.totalContacts || 0);
                const sentCount = Number(campaign.sentCount || 0);
                const actions = getCampaignActions(campaign);

                return (
                  <div key={campaign._id} className="mobile-campaign-card">
                    <div className="mobile-campaign-top">
                      <div>
                        <strong>{campaign.name || 'Untitled campaign'}</strong>
                        <small>{campaign.subject || 'No subject'}</small>
                      </div>
                      <span className={getCampaignStatusClass(status)}>{status}</span>
                    </div>

                    <div className="mobile-campaign-meta">
                      <span><strong>Target:</strong> {campaign.name || 'N/A'}</span>
                      <span><strong>Scheduled:</strong> {formatCampaignDate(campaign.startDateTime || campaign.createdAt)}</span>
                      <span><strong>Recipients:</strong> {totalContacts > 0 ? totalContacts : '—'}</span>
                    </div>

                    <div className="campaign-action-group mobile-actions">
                      {actions.map((action) => (
                        <button
                          key={`${campaign._id}-${action.label}-mobile`}
                          type="button"
                          className={action.danger ? 'table-action danger' : 'table-action'}
                          onClick={action.onClick}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {filteredCampaigns.length > 0 ? (
        <div className="pagination-row">
          <span>
            Showing {Math.min((campaignPage - 1) * campaignPageSize + 1, filteredCampaigns.length)}-{Math.min(campaignPage * campaignPageSize, filteredCampaigns.length)} of {filteredCampaigns.length}
          </span>
          <div className="pagination-controls">
            <button type="button" className="secondary-btn small-btn" disabled={campaignPage === 1} onClick={() => setCampaignPage((page) => Math.max(1, page - 1))}>Previous</button>
            <button type="button" className="secondary-btn small-btn" disabled={campaignPage >= totalCampaignPages} onClick={() => setCampaignPage((page) => Math.min(totalCampaignPages, page + 1))}>Next</button>
          </div>
        </div>
      ) : null}
    </section>
  );

  const filteredTemplates = jobTemplates.filter((template) => {
    if (!templateSearch.trim()) return true;
    const haystack = [template.label, template.role, template.subject, template.body].join(' ').toLowerCase();
    return haystack.includes(templateSearch.toLowerCase());
  });

  const renderTemplatesPage = () => (
    <section className="panel full-panel">
      <div className="page-header compact-page-header">
        <div>
          <p className="eyebrow">Templates</p>
          <h2>Email templates</h2>
          <p className="page-subtitle">Manage your reusable job application email templates.</p>
        </div>
        <button className="primary-btn" onClick={() => openTemplateForm()}>Create template</button>
      </div>

      {templateFormOpen && (
        <div className="template-modal-backdrop" role="presentation" onClick={closeTemplateForm}>
          <div className="template-modal" role="dialog" aria-modal="true" aria-labelledby="template-form-title" onClick={(event) => event.stopPropagation()}>
            <div className="template-modal-header">
              <div>
                <p className="eyebrow">Template</p>
                <h3 id="template-form-title">{editingTemplateId ? 'Edit template' : 'Create template'}</h3>
              </div>
              <button type="button" className="secondary-btn small-btn" onClick={closeTemplateForm}>Close</button>
            </div>

            <div className="template-form-grid">
              <label>
                <span>Template name <strong>*</strong></span>
                <input
                  value={templateForm.label}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder="Frontend Engineer - Product Teams"
                />
              </label>

              <label>
                <span>Target role <strong>*</strong></span>
                <input
                  value={templateForm.role}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, role: event.target.value }))}
                  placeholder="Frontend Developer"
                />
              </label>

              <label>
                <span>Subject <strong>*</strong></span>
                <input
                  value={templateForm.subject}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="Application for Frontend Developer Role"
                />
              </label>

              <div className="template-editor-field">
                <label>
                  <span>Email body <strong>*</strong></span>
                  <textarea
                    rows="12"
                    value={templateForm.body}
                    onChange={(event) => setTemplateForm((current) => ({ ...current, body: event.target.value }))}
                    placeholder="Write your email body..."
                  />
                </label>

                <div className="template-variable-block">
                  <p>Supported variables</p>
                  <div className="template-variable-list">
                    {[ '[FirstName]', '[LastName]', '[Company]', '[Role]', '[YourName]' ].map((variable) => (
                      <span key={variable} className="template-variable-pill">{variable}</span>
                    ))}
                  </div>
                  <small>These values are substituted before delivery to personalize each email.</small>
                </div>
              </div>
            </div>

            {templateError && <p className="field-error">{templateError}</p>}

            <div className="template-modal-footer">
              <button className="secondary-btn" type="button" onClick={closeTemplateForm}>Cancel</button>
              <button className="primary-btn" type="button" onClick={saveTemplateForm} disabled={templateSaving}>
                {templateSaving ? 'Saving...' : editingTemplateId ? 'Save template' : 'Save template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {templateDeleteTarget && (
        <div className="template-modal-backdrop" role="presentation" onClick={() => setTemplateDeleteTarget(null)}>
          <div className="template-confirmation" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>Delete template</h3>
            <p>Are you sure you want to delete <strong>{templateDeleteTarget.label || templateDeleteTarget.role}</strong>?</p>
            <div className="template-modal-footer">
              <button className="secondary-btn" type="button" onClick={() => setTemplateDeleteTarget(null)}>Cancel</button>
              <button className="primary-btn danger-btn" type="button" onClick={confirmDeleteTemplate}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {jobTemplates.length > 3 && (
        <div className="template-toolbar">
          <label className="search-field">
            <span className="sr-only">Search templates</span>
            <input
              type="search"
              value={templateSearch}
              onChange={(event) => setTemplateSearch(event.target.value)}
              placeholder="Search templates"
            />
          </label>
        </div>
      )}

      <div className="template-list">
        {filteredTemplates.length === 0 ? (
          <div className="empty-state-box">
            <p>No templates match your current search.</p>
            <button type="button" className="primary-btn small-btn" onClick={() => openTemplateForm()}>Create template</button>
          </div>
        ) : (
          filteredTemplates.map((template) => (
            <div key={template.id} className={`template-card ${selectedTemplateId === template.id ? 'template-card--active' : ''}`}>
              <button type="button" className="template-select" onClick={() => applyTemplate(template)}>
                <strong>{template.label}</strong>
                <span>{template.role}</span>
                <small>{template.subject}</small>
              </button>
              <div className="template-inline-actions">
                <button className="secondary-btn small-btn" type="button" onClick={() => openTemplateForm(template)}>Edit</button>
                <button className="secondary-btn danger-btn small-btn" type="button" onClick={() => deleteTemplate(template.id)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );

  const renderEditorPage = () => {
    const selectedTemplate = jobTemplates.find((template) => template.id === selectedTemplateId) || jobTemplates[0];
    const contactCount = recipientContacts.length;
    const scheduledTime = startDateTime ? formatCampaignDate(startDateTime) : 'Not scheduled';

    return (
      <div className="workspace-grid create-page-grid">
        <section className="panel workspace-main create-form-shell">
          <div className="page-header compact-page-header">
            <div>
              <p className="eyebrow">Campaign flow</p>
              <h2>Create campaign</h2>
              <p className="page-subtitle">Set up a targeted outreach campaign with a template, contact list, resume, and schedule.</p>
            </div>
            <span className="section-badge">{selectedCampaignId ? 'Update' : 'New'}</span>
          </div>

          <div className="form-stepper" aria-label="Campaign setup steps">
            {['Select template', 'Campaign details', 'Contacts', 'Compose email', 'Resume', 'Schedule', 'Review & save'].map((label, index) => (
              <div key={label} className={index === 0 ? 'stepper-item active' : 'stepper-item'}>
                <span>{index + 1}</span>
                <small>{label}</small>
              </div>
            ))}
          </div>

          <div className="form-section">
            <div className="section-header compact-header">
              <div>
                <p className="eyebrow">Step 1</p>
                <h3>Select email template</h3>
              </div>
              <button className="secondary-btn small-btn" type="button" onClick={() => setTemplatePickerOpen((current) => !current)}>
                {templatePickerOpen ? 'Hide templates' : 'Browse'}
              </button>
            </div>

            <div className="template-picker-box">
              {!templatePickerOpen ? (
                <div className="template-picker-summary">
                  <strong>{selectedTemplate?.label || 'No template selected'}</strong>
                  <span>{selectedTemplate?.role || 'Choose a template for this campaign.'}</span>
                </div>
              ) : null}

              {(templatePickerOpen || !selectedTemplate) && (
                <div className="template-picker-list">
                  {jobTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={selectedTemplateId === template.id ? 'template-picker-item active' : 'template-picker-item'}
                      onClick={() => applyTemplate(template)}
                    >
                      <span>{template.label}</span>
                      <small>{template.role}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="form-section">
            <div className="section-header compact-header">
              <div>
                <p className="eyebrow">Step 2</p>
                <h3>Campaign details</h3>
              </div>
            </div>

            <div className="fields-grid two-columns">
              <label>
                <span>Job position / role</span>
                <input
                  value={selectedTemplate?.role || ''}
                  readOnly
                  placeholder="Select a template to populate this field"
                />
              </label>

              <label>
                <span>Campaign name</span>
                <input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="e.g. Backend Developer outreach" />
              </label>
            </div>

            <div className="fields-grid single-column">
              <label>
                <span>Email subject</span>
                <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Application for Backend Developer Role" />
              </label>

              <label>
                <span>Email body</span>
                <textarea rows="8" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write the outreach email here..." />
              </label>
            </div>
          </div>

          <div className="form-section">
            <div className="section-header compact-header">
              <div>
                <p className="eyebrow">Step 3</p>
                <h3>Import and review contacts</h3>
              </div>
            </div>

            <div className="recipient-toggle" role="tablist" aria-label="Recipient input mode">
              <button
                type="button"
                className={recipientMode === 'upload' ? 'segment-btn active' : 'segment-btn'}
                onClick={() => {
                  resetCurrentRecipientList();
                  setRecipientMode('upload');
                  setSendFirst(false);
                }}
              >
                Upload file
              </button>
              <button
                type="button"
                className={recipientMode === 'manual' ? 'segment-btn active' : 'segment-btn'}
                onClick={() => {
                  resetCurrentRecipientList();
                  setRecipientMode('manual');
                  // Pasted emails are usually urgent: send them before the big lists.
                  setSendFirst(true);
                }}
              >
                Paste emails
              </button>
            </div>

            {recipientMode === 'upload' ? (
              <>
                <div className="upload-surface" onClick={() => contactInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    contactInputRef.current?.click();
                  }
                }}>
                  <input
                    ref={contactInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    hidden
                    onChange={handleContactUpload}
                  />
                  <div className="upload-copy">
                    <strong>Upload contact list</strong>
                    <span>CSV, XLSX, or XLS • up to {formatFileSize(MAX_UPLOAD_SIZE)}</span>
                  </div>
                  <span className="upload-action">Choose file</span>
                </div>

                {selectedFile ? (
                  <div className="selected-file-box">
                    <div>
                      <strong>{selectedFile.name}</strong>
                      <small>{formatFileSize(selectedFile.size)}</small>
                    </div>
                    <button type="button" className="text-btn" onClick={(event) => {
                      event.stopPropagation();
                      clearContactUpload();
                    }}>
                      Remove
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="manual-recipient-box">
                <label>
                  <span>Paste recipient emails</span>
                  <textarea
                    rows="6"
                    value={manualEmailsInput}
                    onChange={(event) => setManualEmailsInput(event.target.value)}
                    placeholder="one@example.com, two@example.com\nthree@example.com"
                  />
                </label>
                <div className="helper-row">
                  <span>Up to 20 recipients. One email per line or comma separated.</span>
                  <button type="button" className="text-btn" onClick={resetCurrentRecipientList}>
                    Clear current recipients
                  </button>
                  <button type="button" className="primary-btn small-btn" onClick={handleManualEmailImport} disabled={manualEmailsLoading}>
                    {manualEmailsLoading ? 'Adding...' : 'Add recipients'}
                  </button>
                </div>
                {manualEmailSummary ? (
                  <div className="validation-panel">
                    <p>Added {manualEmailSummary.imported ?? manualEmailSummary.valid ?? 0} valid addresses.</p>
                    {manualEmailSummary.invalid > 0 ? <ul><li>{manualEmailSummary.invalid} invalid entries were skipped.</li></ul> : null}
                    {manualEmailSummary.duplicate > 0 ? (
                      <ul>
                        <li>{manualEmailSummary.duplicate} duplicates were ignored because they already exist in your contact list.</li>
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            <div className="metrics-grid">
              <div className="metric-card">
                <span>Valid</span>
                <strong>{contactUploadSummary?.valid ?? contactCount}</strong>
              </div>
              <div className="metric-card">
                <span>Invalid</span>
                <strong>{contactUploadSummary?.invalid ?? 0}</strong>
              </div>
              <div className="metric-card">
                <span>Duplicates</span>
                <strong>{contactUploadSummary?.duplicate ?? 0}</strong>
              </div>
            </div>

            {contactUploadSummary ? (
              <div className="validation-panel">
                <p>Imported {contactUploadSummary.imported || contactCount} contacts from {contactUploadSummary.total || contactCount} rows.</p>
                {contactUploadSummary.invalid > 0 ? (
                  <ul>
                    <li>{contactUploadSummary.invalid} rows were skipped because of invalid or missing email addresses.</li>
                  </ul>
                ) : null}
                {contactUploadSummary.duplicate > 0 ? (
                  <ul>
                    <li>{contactUploadSummary.duplicate} duplicate contacts were ignored.</li>
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="empty-contact-state">
                {contactCount > 0 ? `${contactCount} contacts are ready for this campaign.` : 'No contacts imported yet. Upload a file or paste a recipient list to begin.'}
              </div>
            )}

            {uploadingContacts ? <p className="status-message">Uploading contacts...</p> : null}
          </div>

          <div className="form-section">
            <div className="section-header compact-header">
              <div>
                <p className="eyebrow">Step 4</p>
                <h3>Compose and preview email</h3>
              </div>
            </div>

            <div className="preview-layout">
              <div className="editor-panel">
                <label>
                  <span>Subject</span>
                  <input value={subject} onChange={(event) => setSubject(event.target.value)} />
                </label>
                <label>
                  <span>Body</span>
                  <textarea rows="10" value={body} onChange={(event) => setBody(event.target.value)} />
                </label>
              </div>

              <div className="preview-panel">
                <div className="preview-header">
                  <span>Preview</span>
                  <small>Final message</small>
                </div>
                <h4>{subject || 'Email subject preview'}</h4>
                <div className="preview-body">{body || 'Your drafted email will appear here.'}</div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="section-header compact-header">
              <div>
                <p className="eyebrow">Step 5</p>
                <h3>Attach resume</h3>
              </div>
            </div>

            <div className="upload-surface resume-surface" onClick={() => resumeInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                resumeInputRef.current?.click();
              }
            }}>
              <input
                ref={resumeInputRef}
                type="file"
                accept="application/pdf"
                hidden
                onChange={handleResumeUpload}
              />
              <div className="upload-copy">
                <strong>Upload resume</strong>
                <span>PDF only • up to {formatFileSize(MAX_UPLOAD_SIZE)}</span>
              </div>
              <span className="upload-action">Attach</span>
            </div>

            {(resume || uploadedResumeId) ? (
              <div className="selected-file-box">
                <div>
                  <strong>{resume?.name || 'Resume attached'}</strong>
                  <small>{resume ? formatFileSize(resume.size) : 'PDF ready to send'}</small>
                </div>
                <button type="button" className="text-btn" onClick={(event) => {
                  event.stopPropagation();
                  removeResume();
                }}>
                  Remove
                </button>
              </div>
            ) : (
              <div className="empty-contact-state">No resume attached. Add a PDF when required.</div>
            )}

            {resumeUploading ? <p className="status-message">Uploading resume...</p> : null}
          </div>

          <div className="form-section">
            <div className="section-header compact-header">
              <div>
                <p className="eyebrow">Step 6</p>
                <h3>Configure sending schedule</h3>
              </div>
            </div>

            <div className="schedule-grid">
              <label>
                <span>Daily limit</span>
                <input type="number" min="1" max={DAILY_SEND_LIMIT} value={dailyLimit} onChange={(event) => setDailyLimit(Math.min(Number(event.target.value) || DAILY_SEND_LIMIT, DAILY_SEND_LIMIT))} />
              </label>
              <label>
                <span>Batch size</span>
                <input type="number" min="1" max="50" value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value) || 10)} />
              </label>
              <label>
                <span>Delay (ms)</span>
                <input type="number" min="1000" step="1000" value={delayMs} onChange={(event) => setDelayMs(Number(event.target.value) || 60000)} />
              </label>
              <label>
                <span>Start time ({timezoneLabel})</span>
                <input type="datetime-local" value={startDateTime} onChange={(event) => setStartDateTime(event.target.value)} />
              </label>
            </div>

            <div className="helper-row">
              <span>Daily limits and batch sizes stay aligned with the current campaign rules.</span>
              <span>{scheduledTime}</span>
            </div>

            <label className="checkbox-row send-first-row">
              <input type="checkbox" checked={sendFirst} onChange={(event) => setSendFirst(event.target.checked)} />
              <span>
                <strong>Send first</strong> — send this campaign before other running campaigns.
                The rest of the day's {DAILY_SEND_LIMIT} emails go to the other campaigns. (Turned on automatically for pasted emails.)
              </span>
            </label>

            <div className="daily-batch-note" aria-live="polite">
              <strong>Daily sending rule</strong>
              <p>
                Emails go out once each weekday morning (around 9:30–10:30 AM IST). At most <strong>{DAILY_SEND_LIMIT}</strong> emails
                are sent per day across <strong>all</strong> campaigns; this campaign can use up to <strong>{dailyLimit}</strong> of them.
                Remember to click <strong>Start</strong> on the campaign, or nothing will be sent.
              </p>
            </div>
          </div>

          {campaignDetail ? (
            <div className="form-section">
              <div className="section-header compact-header">
                <div>
                  <p className="eyebrow">Campaign audit</p>
                  <h3>Delivery detail</h3>
                </div>
              </div>

              <div className="detail-grid">
                <div className="mini-stat"><span>Total</span><strong>{campaignDetail.totalContacts}</strong></div>
                <div className="mini-stat"><span>Sent</span><strong>{campaignDetail.sentCount}</strong></div>
                <div className="mini-stat"><span>Pending</span><strong>{campaignDetail.pendingCount}</strong></div>
                <div className="mini-stat"><span>Failed</span><strong>{campaignDetail.failedCount}</strong></div>
              </div>

              <div className="detail-grid two-col">
                <div className="audit-panel">
                  <h4>Next batch</h4>
                  {campaignDetail.nextBatch?.length ? (
                    <ul>
                      {campaignDetail.nextBatch.slice(0, Number(campaignDetail.batchSize || 10)).map((log) => (
                        <li key={log.id}>{log.email} — {log.status}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Nothing queued right now.</p>
                  )}
                </div>

                <div className="audit-panel">
                  <h4>Last sent</h4>
                  {campaignDetail.lastBatch?.length ? (
                    <ul>
                      {campaignDetail.lastBatch.map((log) => (
                        <li key={log.id}>{log.email} — {log.status}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No emails have been sent yet.</p>
                  )}
                </div>
              </div>

              <div className="audit-panel full-width">
                <h4>All recipient status</h4>
                {campaignDetail.logs?.length ? (
                  <div className="audit-table-wrap">
                    <table className="campaign-table small-table">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Status</th>
                          <th>Attempts</th>
                          <th>Sent</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignDetail.logs.map((log) => (
                          <tr key={log.id}>
                            <td>{log.email}</td>
                            <td>{log.status}</td>
                            <td>{log.attempts}</td>
                            <td>{log.sentAt ? formatCampaignDate(log.sentAt) : '—'}</td>
                            <td>{log.lastError || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No recipient records found for this campaign yet.</p>
                )}
              </div>
            </div>
          ) : null}

          <div className="form-section">
            <div className="section-header compact-header">
              <div>
                <p className="eyebrow">Step 7</p>
                <h3>Review and save</h3>
              </div>
            </div>

            <div className="review-panel">
              <div className="review-item">
                <span>Template</span>
                <strong>{selectedTemplate?.label || 'None selected'}</strong>
              </div>
              <div className="review-item">
                <span>Recipients</span>
                <strong>{contactCount}</strong>
              </div>
              <div className="review-item">
                <span>Resume</span>
                <strong>{resume || uploadedResumeId ? 'Attached' : 'Not attached'}</strong>
              </div>
              <div className="review-item">
                <span>Schedule</span>
                <strong>{scheduledTime}</strong>
              </div>
            </div>

            <div className="action-row align-right">
              <button className="secondary-btn" onClick={handleSendTestEmail}>Send test email</button>
              <button className="primary-btn" onClick={handleCreateCampaign}>{selectedCampaignId ? 'Save changes' : 'Save campaign'}</button>
            </div>
          </div>

          {statusMessage ? <p className="status-message" role="status" aria-live="polite">{statusMessage}</p> : null}
        </section>

        <aside className="panel workspace-side sticky-summary">
          <div className="section-header compact-header">
            <h3>Campaign summary</h3>
            <span className="section-badge">{selectedCampaign?.status || 'Draft'}</span>
          </div>

          <div className="summary-card-stack">
            <div className="summary-card-item">
              <span>Template</span>
              <strong>{selectedTemplate?.label || 'None selected'}</strong>
            </div>
            <div className="summary-card-item">
              <span>Recipients</span>
              <strong>{contactCount}</strong>
            </div>
            <div className="summary-card-item">
              <span>Resume</span>
              <strong>{resume || uploadedResumeId ? 'Attached' : 'Not attached'}</strong>
            </div>
            <div className="summary-card-item">
              <span>Schedule</span>
              <strong>{scheduledTime}</strong>
            </div>
            <div className="summary-card-item">
              <span>Status</span>
              <strong>{selectedCampaign?.status || 'Draft'}</strong>
            </div>
            <div className="summary-card-item">
              <span>Daily batch</span>
              <strong>{dailyLimit} / day · {batchSize} per send</strong>
            </div>
          </div>

          <div className="summary-brief">
            <h4>{campaignName || 'Campaign name'}</h4>
            <p>{subject || 'No subject yet'}</p>
          </div>
        </aside>
      </div>
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <p className="eyebrow">Secure Access</p>
          <h1>Login to dashboard</h1>

          <form onSubmit={handleLogin} className="auth-form">
            <label>
              Email
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="you@example.com"
                aria-invalid={Boolean(loginError)}
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Your password"
                aria-invalid={Boolean(loginError)}
              />
            </label>

            {loginError && <p className="error-message">{loginError}</p>}

            <button className="primary-btn auth-button" type="submit" disabled={loginLoading}>
              {loginLoading ? 'Signing in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const sidebarItems = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'templates', label: 'Templates Library' },
    { key: 'create', label: 'Create Campaign' },
    { key: 'campaigns', label: 'Campaign List' },
    { key: 'contacts', label: 'Contacts' },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Email Operations</p>
          <h1>Job Application Email Dashboard</h1>
        </div>

        <div className="topbar-actions">
          <span className="session-pill">Authenticated</span>
          <button className="secondary-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="dashboard-shell">
        <aside className="sidebar-nav">
          <div className="sidebar-brand">
            <span className="brand-mark">J</span>
            <div>
              <strong>JobFlow</strong>
              <small>Campaign Suite</small>
            </div>
          </div>

          <nav className="nav-list">
            {sidebarItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={activePage === item.key || (item.key === 'campaigns' && activePage === 'campaign-detail') ? 'nav-item active' : 'nav-item'}
                aria-current={activePage === item.key ? 'page' : undefined}
                onClick={() => {
                  if (item.key === 'create') {
                    openNewCampaign();
                    return;
                  }
                  if (item.key === 'campaigns') refreshCampaigns();
                  setActivePage(item.key);
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="content-panel">
          {isLoading ? (
            <div className="panel loading-box">
              <p>Loading dashboard data...</p>
            </div>
          ) : (
            <>
              {activePage === 'dashboard' && renderOverviewPage()}
              {activePage === 'templates' && renderTemplatesPage()}
              {activePage === 'create' && renderEditorPage()}
              {activePage === 'campaigns' && renderCampaignsPage()}
              {activePage === 'contacts' && (
                <ContactsPage request={requestWithAuth} onOpenCampaign={openCampaignView} />
              )}
              {activePage === 'campaign-detail' && viewCampaignId && (
                <CampaignDetailPage
                  campaignId={viewCampaignId}
                  request={requestWithAuth}
                  onBack={() => { refreshCampaigns(); setActivePage('campaigns'); }}
                  onEdit={openCampaignEditor}
                  onAction={handleCampaignAction}
                  onDelete={confirmAndDeleteCampaign}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
