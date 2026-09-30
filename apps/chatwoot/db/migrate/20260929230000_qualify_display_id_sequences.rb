class QualifyDisplayIdSequences < ActiveRecord::Migration[7.1]
  def up
    drop_display_id_triggers

    create_trigger('accounts_after_insert_row_tr', generated: true, compatibility: 1)
      .on('accounts').after(:insert).for_each(:row) do
      "execute format('create sequence IF NOT EXISTS %I.conv_dpid_seq_%s', TG_TABLE_SCHEMA, NEW.id);"
    end

    create_trigger('conversations_before_insert_row_tr', generated: true, compatibility: 1)
      .on('conversations').before(:insert).for_each(:row) do
      "NEW.display_id := nextval(format('%I.conv_dpid_seq_%s', TG_TABLE_SCHEMA, NEW.account_id));"
    end

    create_trigger('camp_dpid_before_insert', generated: true, compatibility: 1)
      .on('accounts').name('camp_dpid_before_insert').after(:insert).for_each(:row) do
      "execute format('create sequence IF NOT EXISTS %I.camp_dpid_seq_%s', TG_TABLE_SCHEMA, NEW.id);"
    end

    create_trigger('campaigns_before_insert_row_tr', generated: true, compatibility: 1)
      .on('campaigns').before(:insert).for_each(:row) do
      "NEW.display_id := nextval(format('%I.camp_dpid_seq_%s', TG_TABLE_SCHEMA, NEW.account_id));"
    end

    backfill_sequences
  end

  def down
    drop_display_id_triggers

    create_trigger('accounts_after_insert_row_tr', generated: true, compatibility: 1)
      .on('accounts').after(:insert).for_each(:row) do
      "execute format('create sequence IF NOT EXISTS conv_dpid_seq_%s', NEW.id);"
    end

    create_trigger('conversations_before_insert_row_tr', generated: true, compatibility: 1)
      .on('conversations').before(:insert).for_each(:row) do
      "NEW.display_id := nextval('conv_dpid_seq_' || NEW.account_id);"
    end

    create_trigger('camp_dpid_before_insert', generated: true, compatibility: 1)
      .on('accounts').name('camp_dpid_before_insert').after(:insert).for_each(:row) do
      "execute format('create sequence IF NOT EXISTS camp_dpid_seq_%s', NEW.id);"
    end

    create_trigger('campaigns_before_insert_row_tr', generated: true, compatibility: 1)
      .on('campaigns').before(:insert).for_each(:row) do
      "NEW.display_id := nextval('camp_dpid_seq_' || NEW.account_id);"
    end
  end

  private

  def drop_display_id_triggers
    drop_trigger('accounts_after_insert_row_tr', 'accounts', generated: true)
    drop_trigger('conversations_before_insert_row_tr', 'conversations', generated: true)
    drop_trigger('camp_dpid_before_insert', 'accounts', generated: true)
    drop_trigger('campaigns_before_insert_row_tr', 'campaigns', generated: true)
  end

  def backfill_sequences
    execute <<~SQL.squish
      DO $$
      DECLARE v_account bigint; latest bigint;
      BEGIN
        FOR v_account IN SELECT id FROM accounts LOOP
          EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I.conv_dpid_seq_%s', current_schema(), v_account);
          EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I.camp_dpid_seq_%s', current_schema(), v_account);
          SELECT max(display_id) INTO latest FROM conversations c WHERE c.account_id = v_account;
          IF latest IS NOT NULL THEN
            PERFORM setval(format('%I.conv_dpid_seq_%s', current_schema(), v_account), latest);
          END IF;
          SELECT max(display_id) INTO latest FROM campaigns c WHERE c.account_id = v_account;
          IF latest IS NOT NULL THEN
            PERFORM setval(format('%I.camp_dpid_seq_%s', current_schema(), v_account), latest);
          END IF;
        END LOOP;
      END $$;
    SQL
  end
end
