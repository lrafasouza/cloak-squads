import { LegalPage, Section } from "@/components/site/LegalPage";
import type { Metadata } from "next";

const CONTACT_EMAIL = "raffxweb3@gmail.com";
const LAST_UPDATED = "May 7, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy, Aegis",
  description:
    "How Aegis handles information when you use the privacy layer for Squads vaults on Solana. We deliberately collect very little.",
  robots: "index, follow",
  openGraph: {
    title: "Privacy Policy, Aegis",
    description:
      "How Aegis handles information when you use the privacy layer for Squads vaults on Solana.",
    url: "https://aegisz.xyz/privacy",
    siteName: "Aegis",
    type: "article",
  },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      intro={
        <>
          Aegis is built so that we need to know almost nothing about you.
          This Policy explains what information we do and do not handle when
          you use the Aegis web interface and backend, and what rights you
          have over that information.
        </>
      }
    >
      <Section num="01" title="Scope and controller">
        <p>
          This Privacy Policy describes how the Aegis maintainers ("we",
          "us") handle information when you access the Aegis web interface
          at <a href="https://aegisz.xyz">aegisz.xyz</a> and the associated
          backend services (together, the "Service").
        </p>
        <p>
          It does not cover the Squads Protocol, the Cloak Protocol, Solana
          validators or RPC providers, wallet providers, or any other third
          party you interact with through Aegis. Each such party operates
          under its own privacy policy and is independently responsible for
          information you share with it.
        </p>
        <p>
          For privacy questions or to exercise the rights described in
          Section 09, contact{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>

      <Section num="02" title="What we do not collect">
        <p>
          We have built Aegis to need very little about you. We{" "}
          <strong>do not</strong>:
        </p>
        <ul>
          <li>
            ask for your name, email address, postal address, phone number,
            government identifier, or any KYC information;
          </li>
          <li>
            run third-party analytics, advertising, behavioural tracking, or
            session-replay technology on the Service;
          </li>
          <li>
            attach persistent identifiers, fingerprints, or marketing cookies
            to your wallet activity;
          </li>
          <li>
            log your IP address in our application code by default (see
            Section 06 for what infrastructure providers may observe as part
            of normal HTTP traffic);
          </li>
          <li>
            record your private keys, seed phrases, or full wallet signatures
            beyond the short-lived session described in Section 04;
          </li>
          <li>
            sell, rent, or share information with data brokers, ad networks,
            or marketing partners.
          </li>
        </ul>
      </Section>

      <Section num="03" title="What we do store">
        <p>
          To make the product work, the Aegis backend stores a small amount
          of off-chain data. This data is scoped to a vault, visible to its
          signers, and, for opt-in features only, to auditors that signers
          have explicitly authorised.
        </p>
        <ul>
          <li>
            <strong>Sub-vault display names</strong> chosen by signers
            (e.g., "Payroll", "Marketing");
          </li>
          <li>
            <strong>Encrypted transaction memos</strong>. Memos are encrypted
            in your browser using keys derived from a signer's wallet
            signature; we never see the plaintext;
          </li>
          <li>
            <strong>Stealth invoice metadata</strong>: one-time stealth
            address, amount, expiry, claim status, and (for bearer invoices)
            the bearer link nonce;
          </li>
          <li>
            <strong>Recurring payment schedules</strong>: recipient, cadence,
            next-run timestamp, and execution history;
          </li>
          <li>
            <strong>Audit access log entries</strong>. Each time an
            authorised auditor reads scoped vault data, we append a row
            recording who read what and when, so the read itself is
            auditable;
          </li>
          <li>
            <strong>Spending limit configuration</strong> entered by signers
            (caps, windows, counters);
          </li>
          <li>
            <strong>Public account references</strong>: vault and signer
            public keys, which are also visible on-chain.
          </li>
        </ul>
      </Section>

      <Section num="04" title="Wallet signatures and session cookie">
        <p>
          To avoid forcing you to sign a message on every action, we use a
          short-lived session cookie:
        </p>
        <ul>
          <li>
            on first sign-in, your wallet signs a single random challenge
            issued by the backend;
          </li>
          <li>
            the backend verifies the signature, then issues an{" "}
            <code className="rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-ink">
              httpOnly
            </code>
            ,{" "}
            <code className="rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-ink">
              Secure
            </code>
            ,{" "}
            <code className="rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-ink">
              SameSite
            </code>{" "}
            session cookie valid for approximately thirty (30) minutes;
          </li>
          <li>
            subsequent requests within that window are authenticated by the
            cookie alone, so you do not have to re-sign every action.
          </li>
        </ul>
        <p>
          The signed challenge is verified and discarded; we do not retain
          wallet signatures in logs or storage. The cookie expires
          automatically and is invalidated when you sign out or when your
          wallet disconnects.
        </p>
      </Section>

      <Section num="05" title="Blockchain data is public and permanent">
        <p>
          All on-chain activity, including vault creation, multisig
          approvals, license issuance, deposits, withdrawals, and transaction
          metadata recorded on-chain, is written to the Solana public
          ledger.{" "}
          <strong>
            Public ledger data is permanent and outside our control.
          </strong>
        </p>
        <p>
          The privacy properties offered by Aegis derive from the
          cryptographic design of the Cloak Protocol (zero-knowledge proofs
          and shield-pool unlinkability), not from any database or access
          control we operate. You should assume that anything written
          on-chain may be observed and analysed by anyone, indefinitely.
        </p>
      </Section>

      <Section num="06" title="Third parties and infrastructure">
        <p>
          We rely on the following categories of third-party providers, each
          of which may receive technical information necessary to fulfil
          requests, including, in the normal course, your IP address as part
          of HTTP traffic:
        </p>
        <ul>
          <li>
            <strong>Hosting and database</strong>: our application and
            Postgres database run on commercial cloud infrastructure;
          </li>
          <li>
            <strong>Solana RPC providers</strong> (such as Shyft, Helius, and
            public RPC endpoints) for reading state and submitting on-chain
            transactions;
          </li>
          <li>
            <strong>Cloak relay</strong> at{" "}
            <code className="rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-ink">
              api.devnet.cloak.ag
            </code>
            , which we proxy in order to support browser-based proof
            generation;
          </li>
          <li>
            <strong>Wallet providers</strong> (such as Phantom, Solflare, and
            Backpack), injected by your browser via the wallet adapter
            standard.
          </li>
        </ul>
        <p>
          Each provider has its own privacy policy. We have no contractual
          control over what these providers log or how they use that data.
        </p>
      </Section>

      <Section num="07" title="Cookies and similar technologies">
        <p>
          We use a single first-party session cookie, described in Section
          04, for authentication. We do not use marketing cookies, analytics
          cookies, or third-party tracking pixels. We do not load
          third-party tracking scripts on the Service. We do not respond to
          Do Not Track signals because we do not perform tracking that they
          would limit.
        </p>
      </Section>

      <Section num="08" title="Data retention">
        <p>
          We retain off-chain data for as long as it is needed to provide
          the Service, and otherwise as follows:
        </p>
        <ul>
          <li>
            sub-vault display names, encrypted memos, invoice metadata,
            recurring schedules, and spending limits are retained for the
            lifetime of the vault that uses the Service;
          </li>
          <li>
            audit access log entries are retained for the lifetime of the
            vault, to preserve their evidentiary value;
          </li>
          <li>
            session cookies expire after approximately thirty (30) minutes
            of inactivity and are invalidated on sign-out;
          </li>
          <li>
            we may delete devnet data without prior notice during program
            upgrades, infrastructure migrations, or in response to abuse.
          </li>
        </ul>
        <p>
          You may request deletion of off-chain data associated with vaults
          you control by contacting us (see Section 11). On-chain data is
          permanent and cannot be deleted by us.
        </p>
      </Section>

      <Section num="09" title="Your rights">
        <p>
          Depending on where you live, you may have rights under
          data-protection laws such as the EU and UK General Data Protection
          Regulation, the California Consumer Privacy Act, or the Brazilian
          Lei Geral de Proteção de Dados. Because we collect almost no
          personal data tied to your identity, several of these rights apply
          only to limited categories of information.
        </p>
        <p>By contacting us, you may:</p>
        <ul>
          <li>
            ask what off-chain data we hold about a vault that you control;
          </li>
          <li>
            request correction or deletion of that off-chain data;
          </li>
          <li>request a copy in a portable format;</li>
          <li>object to or restrict our processing;</li>
          <li>
            withdraw any consent you have previously given, where
            consent is the legal basis for processing.
          </li>
        </ul>
        <p>
          We respond within a reasonable time and at no cost, except where
          requests are manifestly unfounded or excessive. Identity
          verification is performed by asking you to sign a fresh challenge
          using the wallet associated with the vault.
        </p>
      </Section>

      <Section num="10" title="Security">
        <p>
          We apply standard technical safeguards: TLS in transit; encryption
          at rest where supported by our hosting provider;{" "}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-ink">
            httpOnly
          </code>
          ,{" "}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-ink">
            Secure
          </code>
          , and{" "}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-ink">
            SameSite
          </code>{" "}
          session cookies; principle-of-least-privilege access controls; and
          regular dependency updates.
        </p>
        <p>
          <strong>No system is fully secure.</strong> Aegis is on devnet and
          pre-audit; you must not entrust real value or sensitive personal
          data to the Service. If you believe you have discovered a security
          vulnerability, please report it to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and give
          us a reasonable opportunity to investigate before disclosing.
        </p>
      </Section>

      <Section num="11" title="Children">
        <p>
          The Service is not directed at, and we do not knowingly collect
          information from, anyone under the age of eighteen (18). If you
          believe a minor has provided information through the Service,
          please contact us so that we can take appropriate action.
        </p>
      </Section>

      <Section num="12" title="International users">
        <p>
          The Service is operated from, and our infrastructure providers may
          process data in, jurisdictions outside your country of residence.
          By using the Service, you understand that your information may be
          processed in countries whose data-protection laws differ from
          those of your jurisdiction.
        </p>
      </Section>

      <Section num="13" title="Changes to this Policy">
        <p>
          We may update this Policy from time to time. Material changes will
          be reflected by updating the "Last updated" date at the top of
          this page; where reasonably possible, we will surface the change
          in the Service or notify you in another reasonable manner. Your
          continued use of the Service after the change takes effect
          constitutes acceptance of the updated Policy.
        </p>
      </Section>

      <Section num="14" title="Contact">
        <p>
          For privacy questions, requests to exercise your rights, or
          security reports, contact:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
