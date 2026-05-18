import { LegalPage, Section } from "@/components/site/LegalPage";
import type { Metadata } from "next";

const CONTACT_EMAIL = "raffxweb3@gmail.com";
const LAST_UPDATED = "May 7, 2026";

export const metadata: Metadata = {
  title: "Terms of Use, Aegis",
  description:
    "Terms governing access to and use of Aegis, the privacy layer for Squads vaults on Solana. Aegis is currently devnet-only and pre-audit.",
  robots: "index, follow",
  openGraph: {
    title: "Terms of Use, Aegis",
    description:
      "Terms governing access to and use of Aegis, the privacy layer for Squads vaults on Solana.",
    url: "https://aegisz.xyz/terms",
    siteName: "Aegis",
    type: "article",
  },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      lastUpdated={LAST_UPDATED}
      intro={
        <>
          These Terms govern your access to and use of Aegis, a privacy layer for Squads vaults on
          Solana. Read them carefully, particularly the devnet status, no-warranty, and self-custody
          sections. By using the Service you agree to these Terms.
        </>
      }
    >
      <Section num="01" title="Acceptance of these Terms">
        <p>
          By accessing or using the Aegis web interface at{" "}
          <a href="https://aegisz.xyz">aegisz.xyz</a>, the associated backend, or the Aegis on-chain
          programs through any official client (together, the "Service"), you agree to be bound by
          these Terms of Use. If you do not agree, do not access or use the Service.
        </p>
        <p>
          Aegis is operated as an independent open-source project by its maintainers and
          contributors (collectively, "we", "us", "Aegis"). No legal entity is named at this time;
          references to Aegis in these Terms refer to the project and its maintainers acting in that
          capacity.
        </p>
      </Section>

      <Section num="02" title="What Aegis is">
        <p>
          Aegis is a privacy layer for Solana treasuries that combines four components, each
          governed by its own license and behaviour:
        </p>
        <ul>
          <li>
            <strong>Squads Protocol v4 multisig vaults</strong> that you create and control. Aegis
            does not modify the Squads programs.
          </li>
          <li>
            <strong>The Aegis gatekeeper program</strong>, an on-chain Solana program that issues
            single-use, time-bound execution licenses after multisig approval.
          </li>
          <li>
            <strong>The Cloak Protocol shield pool</strong>, a third-party zero-knowledge primitive
            used to make payments cryptographically unlinkable on the public ledger.
          </li>
          <li>
            <strong>A web interface and stateless backend</strong> that orchestrate these
            primitives, store a small amount of off-chain metadata (described in the Privacy
            Policy), and proxy the Cloak relay to support browser-based proof generation.
          </li>
        </ul>
        <p>
          Aegis is non-custodial. The Service does not custody your assets or private keys at any
          point.
        </p>
      </Section>

      <Section num="03" title="Devnet status, no warranty of any kind" emphasis>
        <p>
          <strong>
            Aegis is currently deployed on Solana devnet only. The Aegis on-chain programs have not
            undergone independent third-party security audit. The Service is provided strictly for
            testing, evaluation, and demonstration purposes.
          </strong>
        </p>
        <p>
          Do not connect mainnet wallets, do not transact with assets that have monetary value, and
          do not rely on the Service for production treasury operations. Any value placed into the
          Service may be lost permanently, including (without limitation) through bugs in the Aegis
          programs, bugs in dependencies, misconfiguration, devnet resets, program upgrades, key
          compromise, or compromise of any third-party infrastructure.
        </p>
      </Section>

      <Section num="04" title="Eligibility">
        <p>
          You must be at least eighteen (18) years old and have the full legal capacity to enter
          into binding agreements in your jurisdiction. By using the Service, you represent and
          warrant that you meet these requirements and that you are not a Restricted Person as
          defined in Section 06.
        </p>
      </Section>

      <Section num="05" title="Self-custody and signer responsibility">
        <p>
          Aegis is non-custodial. Funds in your Squads vault are owned by an on-chain
          program-derived address (PDA) that is controlled by your multisig configuration. Approval
          and execution authority belongs exclusively to the signers your multisig defines.
        </p>
        <p>You are solely responsible for:</p>
        <ul>
          <li>
            generating, storing, backing up, and protecting the private keys of every signer you
            control;
          </li>
          <li>choosing and maintaining the multisig threshold and member set;</li>
          <li>
            reviewing every transaction in full before signing it, including recipient, amount,
            instructions, and any encrypted memo;
          </li>
          <li>
            the on-chain consequences of any approval you sign, including permanent loss of funds.
          </li>
        </ul>
        <p>
          We cannot recover lost keys, reverse approved transactions, freeze accounts, or act on
          your behalf. The integrity of your treasury depends entirely on you and the other signers
          you choose.
        </p>
      </Section>

      <Section num="06" title="Restricted persons and jurisdictions">
        <p>You may not access or use the Service if you are:</p>
        <ul>
          <li>
            located in, organised under the laws of, or ordinarily resident in any jurisdiction
            subject to comprehensive sanctions administered by the United States, the European
            Union, the United Kingdom, or the United Nations Security Council (including, as of the
            date of these Terms, Cuba, Iran, North Korea, Syria, and the Crimea, Donetsk, and
            Luhansk regions);
          </li>
          <li>
            listed on, or owned or controlled by a person listed on, any sanctions or denied-party
            list, including the U.S. Treasury OFAC Specially Designated Nationals list, the EU
            Consolidated Financial Sanctions List, or the UK HMT Consolidated List;
          </li>
          <li>
            otherwise prohibited by applicable law from accessing privacy or cryptocurrency
            infrastructure.
          </li>
        </ul>
        <p>
          Use of a virtual private network or any other measure to circumvent these restrictions is
          itself a material breach of these Terms.
        </p>
      </Section>

      <Section num="07" title="Acceptable use">
        <p>You will not use the Service to:</p>
        <ul>
          <li>launder the proceeds of crime, finance terrorism, or evade sanctions;</li>
          <li>
            defraud, harass, or otherwise harm any other person, or facilitate any unlawful
            activity;
          </li>
          <li>
            transact with, or on behalf of, any party you have reason to believe is sanctioned or
            otherwise legally prohibited from receiving value;
          </li>
          <li>
            attempt to circumvent, reverse-engineer, or disrupt the on-chain programs, the
            gatekeeper, the operator, the Cloak relay proxy, or the web interface, except to the
            extent expressly permitted by the applicable open-source licenses;
          </li>
          <li>
            probe, scan, or test the vulnerability of the Service except under a written agreement
            with the maintainers;
          </li>
          <li>
            interfere with, or place an unreasonable burden on, the Service or any third-party
            infrastructure it relies on, including by scripted abuse of the relay proxy.
          </li>
        </ul>
      </Section>

      <Section num="08" title="Third-party dependencies">
        <p>
          Aegis interoperates with infrastructure operated by third parties, including, without
          limitation, the Squads Protocol, the Cloak Protocol, Solana validators and RPC providers
          (such as Shyft and Helius), wallet providers, hosting and database providers, and the
          Solana network itself. These services are governed by their own terms of use and privacy
          policies.
        </p>
        <p>
          We do not control, endorse, or guarantee any third-party service. Failures, downtime,
          breaches, vulnerabilities, regulatory action, or unilateral changes affecting these
          services may degrade, break, or permanently disable parts of the Service. We have no
          liability for any such third-party act or omission.
        </p>
      </Section>

      <Section num="09" title="Privacy architecture and selective audit">
        <p>
          Aegis relies on the cryptographic design of the Cloak Protocol to make payments unlinkable
          at the public-ledger level. Aegis additionally provides an opt-in audit access log:
          signers may grant scoped read access to authorised auditors, every read is recorded in a
          tamper-evident log, and exports are signed with Ed25519 so that the recipient can verify
          provenance.
        </p>
        <p>
          <strong>
            Privacy guarantees derive from cryptographic protocols, not from any contractual promise
            made by us, and may be defeated by your own actions
          </strong>{" "}
          (for example, by publishing memos, reusing addresses, linking deposits and withdrawals
          through timing, or sharing screenshots), by bugs in any component, or by compromise of any
          third-party infrastructure. You should not assume that the Service offers anonymity
          against a sophisticated adversary, particularly while it remains on devnet and pre-audit.
        </p>
      </Section>

      <Section num="10" title="Intellectual property">
        <p>
          The Aegis on-chain programs (the "gatekeeper" and "operator") are, or will be, released
          under the Apache License 2.0 and may be inspected, used, and forked subject to the terms
          of that license. The Aegis web interface, backend services, brand assets, documentation,
          and database schema are © the Aegis maintainers and are made available solely to enable
          use of the Service. No other license, express or implied, is granted.
        </p>
        <p>
          "Aegis" and the Aegis logo are unregistered marks of the maintainers. You may reference
          the Service for factual purposes (such as commentary or third-party reviews) but may not
          use the marks in any manner that implies endorsement, sponsorship, or affiliation.
        </p>
        <p>
          Any feedback, suggestions, bug reports, or ideas you send us regarding the Service are
          non-confidential, and you grant us a perpetual, irrevocable, royalty-free licence to use
          them without restriction or obligation.
        </p>
      </Section>

      <Section num="11" title="Disclaimer of warranties">
        <p>
          THE SERVICE, THE AEGIS ON-CHAIN PROGRAMS, AND ALL RELATED SOFTWARE, INTERFACES,
          DOCUMENTATION, AND CONTENT ARE PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF
          ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. TO THE MAXIMUM EXTENT
          PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING WITHOUT LIMITATION ANY IMPLIED
          WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT,
          AND ANY WARRANTIES ARISING FROM COURSE OF DEALING OR USAGE OF TRADE.
        </p>
        <p>
          We do not warrant that the Service will be uninterrupted, error-free, secure, free of
          viruses or harmful components, or that any defect will be corrected. We do not warrant the
          accuracy, completeness, or reliability of any information obtained through the Service.
        </p>
      </Section>

      <Section num="12" title="Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL THE AEGIS MAINTAINERS,
          CONTRIBUTORS, OR THEIR RESPECTIVE AFFILIATES BE LIABLE FOR ANY DIRECT, INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING, WITHOUT
          LIMITATION, LOST PROFITS, LOST DATA, LOST KEYS, LOST OR INACCESSIBLE FUNDS, BUSINESS
          INTERRUPTION, OR LOSS OF GOODWILL, ARISING OUT OF OR RELATED TO YOUR ACCESS TO, USE OF, OR
          INABILITY TO USE THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH
          DAMAGES.
        </p>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR AGGREGATE LIABILITY FOR ALL CLAIMS RELATING TO
          THE SERVICE WILL NOT EXCEED ONE HUNDRED U.S. DOLLARS (USD 100). YOU ACKNOWLEDGE THAT THIS
          ALLOCATION OF RISK IS A FUNDAMENTAL BASIS OF THESE TERMS AND THAT WE WOULD NOT MAKE THE
          SERVICE AVAILABLE WITHOUT IT.
        </p>
      </Section>

      <Section num="13" title="Indemnification">
        <p>
          You agree to indemnify, defend, and hold harmless the Aegis maintainers and contributors
          from and against any claim, demand, loss, damage, liability, cost, or expense (including
          reasonable legal fees) arising out of or related to (a) your access to or use of the
          Service, (b) your breach of these Terms, (c) your violation of any law or third-party
          right, or (d) any transaction you authorise through the Service.
        </p>
      </Section>

      <Section num="14" title="Modifications, suspension, and termination">
        <p>
          We may modify these Terms at any time. Material changes will be reflected by updating the
          "Last updated" date at the top of this page; where reasonably possible, we will also
          surface the change in the Service. Your continued use of the Service after a change
          constitutes acceptance of the modified Terms.
        </p>
        <p>
          We may at any time, with or without notice, restrict, suspend, or terminate your access to
          the hosted interface or backend, in whole or in part, including for suspected violation of
          these Terms. The Aegis on-chain programs are open-source; you can continue to interact
          with them directly using your own tooling regardless of your access to the hosted Service.
        </p>
      </Section>

      <Section num="15" title="Governing law and dispute resolution">
        <p>
          These Terms are governed by the laws applicable to your place of ordinary residence,
          unless mandatory law in your jurisdiction provides otherwise. Where legally permissible,
          any dispute arising out of or related to these Terms or the Service will be resolved by
          individual binding arbitration; class actions, class arbitrations, and representative
          actions are waived to the maximum extent permitted by law.
        </p>
        <p>
          Nothing in this Section limits any right you may have under mandatory consumer-protection
          law in your jurisdiction.
        </p>
      </Section>

      <Section num="16" title="Severability and entire agreement">
        <p>
          If any provision of these Terms is held invalid or unenforceable by a court of competent
          jurisdiction, the remaining provisions will remain in full force and effect, and the
          invalid or unenforceable provision will be deemed modified to the minimum extent necessary
          to make it enforceable.
        </p>
        <p>
          These Terms, together with the Privacy Policy and any additional terms expressly
          incorporated by reference, constitute the entire agreement between you and Aegis regarding
          the Service and supersede any prior agreement or understanding on the same subject.
        </p>
      </Section>

      <Section num="17" title="Contact">
        <p>
          For legal notices, questions about these Terms, or to report a security issue, contact:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
