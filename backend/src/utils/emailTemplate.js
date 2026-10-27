export function buildJobApplicationEmail({ name, company, jobTitle, role = 'Node.js Developer', subject } = {}) {
  const recipientName = name ? `Hi ${name},` : 'Hello,';
  const companyLine = company ? `I am applying for the ${jobTitle || 'Backend Developer'} opportunity at ${company}.` : `I am applying for the ${jobTitle || 'Backend Developer'} position.`;

  const body = `${recipientName}

Thank you for considering my application for the ${role} role.

I am reaching out to express my interest in the ${jobTitle || 'Backend Developer'} opportunity. ${companyLine}

I would appreciate the opportunity to discuss how my experience aligns with the role and the team’s goals. I am especially interested in backend engineering, API design, system reliability, and building maintainable services.

I have attached my resume for your review and would welcome the chance to speak further.

Thank you for your time and consideration.

Best regards,
[Your Name]
[Your LinkedIn or Portfolio URL, if available]
`;

  const emailSubject = subject || `Application for ${jobTitle || 'Backend Developer'} Role`;

  return { subject: emailSubject, body };
}
